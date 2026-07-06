"""
╔══════════════════════════════════════════════════════════════╗
║         KTRM ROBOT — U2B-Vertex ERP                         ║
║         ТОО «Vertex Metrology» · Шымкент                    ║
║         Робот автоматического внесения в е-КТРМ             ║
╚══════════════════════════════════════════════════════════════╝

Логика:
  1. Каждые N секунд опрашивает Neon PostgreSQL
  2. Берёт записи со статусом "Внести в КТРМ"
  3. Открывает techreg.gov.kz через Playwright
  4. Заполняет форму ЭУПСИ данными из БД
  5. Подписывает через NCALayer (ЭЦП поверителя)
  6. Меняет статус → "КТРМ 70%"
  7. Берёт записи "КТРМ 70%"
  8. Подписывает второй ЭЦП (руководитель)
  9. Меняет статус → "Внесён в КТРМ"
  10. Повторяет с шага 1

Установка зависимостей:
  pip install playwright psycopg2-binary websockets python-dotenv
  playwright install chromium

Запуск:
  python ktrm_robot.py
"""

import asyncio
import json
import logging
import os
import sys
import time
from datetime import datetime
from pathlib import Path

import psycopg2
import websockets
from dotenv import load_dotenv
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeout


# ══════════════════════════════════════════════════════════════
#  RETRY / RESILIENCE — умная обработка багов сайта
# ══════════════════════════════════════════════════════════════

class SiteError(Exception):
    """Ошибка сайта — можно повторить"""
    pass

class FatalError(Exception):
    """Критическая ошибка — пропустить запись"""
    pass


async def retry(coro_fn, max_attempts=5, delay_sec=10, label="операция"):
    """
    Универсальный ретрай для любого действия.
    
    Логика:
      Попытка 1 → сразу
      Попытка 2 → ждём 10 сек
      Попытка 3 → ждём 20 сек  
      Попытка 4 → ждём 40 сек
      Попытка 5 → ждём 80 сек
      После 5 попыток → бросаем FatalError
    """
    for attempt in range(1, max_attempts + 1):
        try:
            result = await coro_fn()
            if attempt > 1:
                log.info(f"  ✓ {label} — успех с попытки {attempt}")
            return result

        except FatalError:
            raise  # критическую не повторяем

        except Exception as e:
            wait = delay_sec * (2 ** (attempt - 1))  # экспоненциальный рост
            if attempt < max_attempts:
                log.warning(f"  ⚠ {label} — попытка {attempt}/{max_attempts}: {e}")
                log.warning(f"    Жду {wait} сек и пробую снова...")
                await asyncio.sleep(wait)
            else:
                log.error(f"  ✗ {label} — все {max_attempts} попыток исчерпаны: {e}")
                raise FatalError(f"{label}: {e}")


# ══════════════════════════════════════════════════════════════
#  ДЕТЕКТОР СОСТОЯНИЯ САЙТА
# ══════════════════════════════════════════════════════════════

class SiteWatcher:
    """
    Следит за состоянием страницы techreg.gov.kz
    Определяет баги и зависания
    """

    # Признаки что сайт завис / забаговал
    BUG_SIGNS = [
        "503", "502", "504",            # HTTP ошибки сервера
        "Service Unavailable",
        "Bad Gateway",
        "Gateway Timeout",
        "Ошибка сервера",
        "Сервис недоступен",
        "Попробуйте позже",
        "Internal Server Error",
    ]

    # Признаки что форма "пустая" (не загрузилась)
    EMPTY_FORM_SIGNS = [
        "загрузка", "loading", "please wait",
    ]

    def __init__(self, page):
        self.page = page

    async def check_page_ok(self) -> tuple[bool, str]:
        """
        Проверить что страница нормально загружена.
        Возвращает (ok: bool, reason: str)
        """
        try:
            # 1. Проверяем текст страницы на баги
            body_text = await self.page.inner_text("body")
            body_lower = body_text.lower()

            for sign in self.BUG_SIGNS:
                if sign.lower() in body_lower:
                    return False, f"Сайт вернул ошибку: {sign}"

            # 2. Проверяем что страница не в процессе загрузки
            for sign in self.EMPTY_FORM_SIGNS:
                if sign.lower() in body_lower and len(body_text) < 500:
                    return False, f"Страница не загрузилась: {sign}"

            # 3. Проверяем что URL не редирект на ошибку
            url = self.page.url
            if "error" in url or "maintenance" in url:
                return False, f"Редирект на страницу ошибки: {url}"

            return True, "OK"

        except Exception as e:
            return False, f"Ошибка проверки: {e}"

    async def wait_page_stable(self, timeout_sec=30) -> bool:
        """
        Ждём пока страница перестанет "прыгать" (редиректы, подгрузки)
        """
        log.info("    ⏳ Жду стабилизации страницы...")
        prev_url = ""
        stable_count = 0

        for _ in range(timeout_sec * 2):  # проверяем каждые 0.5 сек
            await asyncio.sleep(0.5)
            curr_url = self.page.url

            if curr_url == prev_url:
                stable_count += 1
                if stable_count >= 4:  # 2 секунды без изменений
                    return True
            else:
                stable_count = 0
                prev_url = curr_url

        log.warning("    ! Страница не стабилизировалась")
        return False

    async def wait_for_element_safe(self, selectors: list, timeout_ms=15000) -> object | None:
        """
        Ждём появления элемента (любого из списка селекторов).
        Не падаем если не найдено — просто возвращаем None.
        """
        for sel in selectors:
            try:
                el = await self.page.wait_for_selector(sel, timeout=timeout_ms // len(selectors))
                if el:
                    return el
            except Exception:
                continue
        return None

    async def screenshot_on_error(self, name: str):
        """Сделать скриншот при ошибке для диагностики"""
        try:
            path = f"error_{name}_{datetime.now().strftime('%H%M%S')}.png"
            await self.page.screenshot(path=path)
            log.info(f"    📸 Скриншот сохранён: {path}")
        except Exception:
            pass


# ══════════════════════════════════════════════════════════════
#  УМНЫЙ НАВИГАТОР
# ══════════════════════════════════════════════════════════════

class SmartNavigator:
    """
    Умная навигация с автоматическим восстановлением после багов
    """

    def __init__(self, page):
        self.page    = page
        self.watcher = SiteWatcher(page)

    async def goto_safe(self, url: str, max_attempts=5) -> bool:
        """
        Перейти на страницу с ретраями.
        Если сайт завис — перезагружаем страницу и ждём.
        """
        async def _try_goto():
            log.info(f"    → Открываю: {url}")
            await self.page.goto(url, wait_until="domcontentloaded", timeout=30000)
            await self.watcher.wait_page_stable()

            ok, reason = await self.watcher.check_page_ok()
            if not ok:
                log.warning(f"    ⚠ Страница с ошибкой: {reason}")
                # Пробуем перезагрузить
                log.info("    🔄 Перезагрузка страницы...")
                await self.page.reload(wait_until="domcontentloaded", timeout=30000)
                await asyncio.sleep(3)

                ok2, reason2 = await self.watcher.check_page_ok()
                if not ok2:
                    raise SiteError(f"После перезагрузки: {reason2}")

            return True

        try:
            await retry(_try_goto, max_attempts=max_attempts, delay_sec=15,
                       label=f"переход на {url}")
            return True
        except FatalError as e:
            log.error(f"    ✗ Не удалось открыть {url}: {e}")
            await self.watcher.screenshot_on_error("goto_failed")
            return False

    async def click_safe(self, selectors: list | str, label="кнопка") -> bool:
        """
        Безопасный клик — пробует несколько селекторов,
        ждёт если элемент не кликабелен
        """
        if isinstance(selectors, str):
            selectors = [selectors]

        async def _try_click():
            el = await self.watcher.wait_for_element_safe(selectors, timeout_ms=10000)
            if not el:
                raise SiteError(f"Элемент не найден: {label}")

            # Проверяем что элемент видим и кликабелен
            is_visible = await el.is_visible()
            is_enabled = await el.is_enabled()
            if not is_visible or not is_enabled:
                raise SiteError(f"Элемент не кликабелен: {label} (visible={is_visible}, enabled={is_enabled})")

            await el.scroll_into_view_if_needed()
            await el.click()
            await asyncio.sleep(0.5)
            return True

        try:
            await retry(_try_click, max_attempts=4, delay_sec=8, label=f"клик: {label}")
            return True
        except FatalError:
            log.error(f"    ✗ Не удалось нажать: {label}")
            return False

    async def fill_safe(self, selectors: list | str, value: str,
                        label="поле", delay_ms=60) -> bool:
        """
        Безопасное заполнение поля — с проверкой что значение записалось
        """
        if isinstance(selectors, str):
            selectors = [selectors]

        async def _try_fill():
            el = await self.watcher.wait_for_element_safe(selectors, timeout_ms=8000)
            if not el:
                raise SiteError(f"Поле не найдено: {label}")

            await el.scroll_into_view_if_needed()
            await el.click()
            await asyncio.sleep(0.2)

            # Очищаем поле тремя способами (сайт может глючить)
            await el.fill("")
            await self.page.keyboard.press("Control+A")
            await self.page.keyboard.press("Delete")
            await asyncio.sleep(0.1)

            # Вводим значение
            await el.type(str(value), delay=delay_ms)
            await asyncio.sleep(0.3)

            # Проверяем что значение записалось
            actual = await el.input_value()
            if str(value) not in actual and actual not in str(value):
                raise SiteError(f"Значение не записалось в поле {label}: ожидалось '{value}', получилось '{actual}'")

            return True

        try:
            await retry(_try_fill, max_attempts=3, delay_sec=5, label=f"заполнение: {label}")
            return True
        except FatalError:
            log.warning(f"    ! Не удалось заполнить: {label}")
            return False

    async def wait_success(self, success_selectors: list, timeout_sec=60) -> bool:
        """
        Ждём успешного завершения операции.
        Параллельно следим за появлением ошибок на странице.
        """
        log.info(f"    ⏳ Жду подтверждения (до {timeout_sec} сек)...")

        error_selectors = [
            ".alert-danger", ".error-message", "[class*='error']",
            ".modal-error", "#errorMsg",
        ]

        deadline = asyncio.get_event_loop().time() + timeout_sec
        while asyncio.get_event_loop().time() < deadline:
            await asyncio.sleep(1)

            # Проверяем успех
            for sel in success_selectors:
                try:
                    el = await self.page.query_selector(sel)
                    if el and await el.is_visible():
                        log.info("    ✓ Операция подтверждена!")
                        return True
                except Exception:
                    pass

            # Проверяем ошибки
            for sel in error_selectors:
                try:
                    el = await self.page.query_selector(sel)
                    if el and await el.is_visible():
                        err_text = await el.inner_text()
                        log.warning(f"    ⚠ Сайт вернул ошибку: {err_text[:100]}")
                        # Ошибка на странице — возможно нужно повторить
                        return False
                except Exception:
                    pass

            # Проверяем общее состояние страницы
            ok, reason = await self.watcher.check_page_ok()
            if not ok:
                log.warning(f"    ⚠ Страница с проблемой: {reason}")
                return False

        log.warning("    ! Таймаут ожидания подтверждения")
        return False

# ══════════════════════════════════════════════════════════════
#  КОНФИГ
# ══════════════════════════════════════════════════════════════
load_dotenv()  # читаем .env файл рядом со скриптом

CONFIG = {
    # База данных Neon PostgreSQL
    "DATABASE_URL": os.getenv("DATABASE_URL", ""),

    # е-КТРМ
    "TECHREG_URL":  "https://techreg.gov.kz",
    "EUPSI_URL":    "https://techreg.gov.kz/eupsi/certificate/new",

    # NCALayer WebSocket (запущен локально)
    "NCALAYER_WS":  "wss://127.0.0.1:13579/",

    # Интервал опроса БД (секунды)
    "POLL_INTERVAL": int(os.getenv("POLL_INTERVAL", "30")),

    # Максимум записей за один проход
    "BATCH_SIZE":    int(os.getenv("BATCH_SIZE", "10")),

    # Задержка между записями (секунды) — не спешим
    "DELAY_BETWEEN": float(os.getenv("DELAY_BETWEEN", "3.0")),

    # Режим: True = headless (без окна браузера), False = показывать браузер
    "HEADLESS":      os.getenv("HEADLESS", "false").lower() == "true",
}

# ── СТАТУСЫ ──────────────────────────────────────────────────
STATUS = {
    "WORK":     "В работе",
    "READY":    "Готова к КТРМ",
    "SUBMIT":   "Внести в КТРМ",   # ← робот берёт отсюда
    "HALF":     "КТРМ 70%",        # ← после подписи №1
    "DONE":     "Внесён в КТРМ",   # ← после подписи №2
}

# ══════════════════════════════════════════════════════════════
#  ЛОГГЕР
# ══════════════════════════════════════════════════════════════
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("ktrm_robot.log", encoding="utf-8"),
    ],
)
log = logging.getLogger("KTRM")


def banner():
    print("""
╔══════════════════════════════════════════════╗
║   🤖  KTRM ROBOT  —  U2B-Vertex ERP         ║
║   ТОО «Vertex Metrology» · Шымкент           ║
║   Версия 1.0 · Python + Playwright           ║
╚══════════════════════════════════════════════╝
""")


# ══════════════════════════════════════════════════════════════
#  БАЗА ДАННЫХ — Neon PostgreSQL
# ══════════════════════════════════════════════════════════════
class Database:
    def __init__(self, url: str):
        self.url = url
        self.conn = None

    def connect(self):
        """Подключение к Neon PostgreSQL"""
        try:
            self.conn = psycopg2.connect(self.url)
            self.conn.autocommit = True
            log.info("✓ БД подключена: Neon PostgreSQL")
        except Exception as e:
            log.error(f"✗ Ошибка подключения к БД: {e}")
            raise

    def get_records(self, status: str, limit: int) -> list[dict]:
        """Получить записи с указанным статусом"""
        try:
            with self.conn.cursor() as cur:
                cur.execute("""
                    SELECT 
                        id, fio, address, meter_type, serial_no,
                        check_date, next_check_date, stamp_no,
                        water_type, meter_readings, note,
                        oper_status, pay_status, invoice_type,
                        source
                    FROM certificates
                    WHERE oper_status = %s
                    ORDER BY updated_at ASC
                    LIMIT %s
                """, (status, limit))
                cols = [d[0] for d in cur.description]
                rows = cur.fetchall()
                return [dict(zip(cols, row)) for row in rows]
        except Exception as e:
            log.error(f"✗ Ошибка чтения БД: {e}")
            return []

    def update_status(self, record_id: str, new_status: str, ktrm_reg_no: str = None):
        """Обновить статус записи в БД"""
        try:
            with self.conn.cursor() as cur:
                if ktrm_reg_no:
                    cur.execute("""
                        UPDATE certificates
                        SET oper_status = %s,
                            ktrm_reg_no = %s,
                            ktrm_done_at = NOW(),
                            updated_at = NOW()
                        WHERE id = %s
                    """, (new_status, ktrm_reg_no, record_id))
                else:
                    cur.execute("""
                        UPDATE certificates
                        SET oper_status = %s,
                            updated_at = NOW()
                        WHERE id = %s
                    """, (new_status, record_id))
            log.info(f"  ✓ БД обновлена: {record_id[:8]}... → {new_status}")
        except Exception as e:
            log.error(f"  ✗ Ошибка обновления БД: {e}")

    def log_error(self, record_id: str, error_msg: str):
        """Записать ошибку в лог БД"""
        try:
            with self.conn.cursor() as cur:
                cur.execute("""
                    UPDATE certificates
                    SET ktrm_error = %s, updated_at = NOW()
                    WHERE id = %s
                """, (error_msg, record_id))
        except Exception:
            pass

    def ping(self) -> bool:
        """Проверить соединение с БД"""
        try:
            with self.conn.cursor() as cur:
                cur.execute("SELECT 1")
            return True
        except Exception:
            try:
                self.connect()
                return True
            except Exception:
                return False


# ══════════════════════════════════════════════════════════════
#  NCALayer — ЭЦП подпись через WebSocket
# ══════════════════════════════════════════════════════════════
class NCALayer:
    """
    NCALayer — локальный WebSocket сервер на 127.0.0.1:13579
    Отвечает за криптографические операции с ЭЦП ключами
    """
    WS_URL = "wss://127.0.0.1:13579/"

    async def check_alive(self) -> bool:
        """Проверить что NCALayer запущен"""
        try:
            async with websockets.connect(
                self.WS_URL, ssl=False, open_timeout=3
            ) as ws:
                return True
        except Exception:
            return False

    async def sign_xml(self, xml_data: str, key_type: str = "PKCS12") -> str | None:
        """
        Подписать XML данные через NCALayer
        key_type: PKCS12 (файл .p12) или PKCS11 (токен/флешка)
        Возвращает подписанный XML или None при ошибке
        """
        request = {
            "module":  "kz.gov.pki.knca.commonUtils",
            "method":  "signXml",
            "args": [
                key_type,       # тип хранилища ключа
                "SIGNATURE",    # тип сертификата
                xml_data,       # данные для подписи
                "",             # путь к файлу (пустой = диалог выбора)
                "",             # пароль (пустой = диалог ввода)
            ]
        }
        try:
            async with websockets.connect(
                self.WS_URL, ssl=False, open_timeout=10
            ) as ws:
                log.info("    → Отправка запроса в NCALayer...")
                await ws.send(json.dumps(request))

                # Ждём ответа (пользователь выбирает ключ и вводит пароль)
                log.info("    ⏳ Ожидание подписи (до 120 сек)...")
                response_raw = await asyncio.wait_for(ws.recv(), timeout=120)
                response = json.loads(response_raw)

                if response.get("status") == "OK":
                    signed = response.get("responseObject", "")
                    log.info("    ✓ Подпись получена!")
                    return signed
                else:
                    err = response.get("errorCode", "UNKNOWN")
                    log.error(f"    ✗ NCALayer ошибка: {err}")
                    return None

        except asyncio.TimeoutError:
            log.error("    ✗ Таймаут NCALayer — пользователь не подписал за 120 сек")
            return None
        except Exception as e:
            log.error(f"    ✗ NCALayer ошибка: {e}")
            return None

    def build_xml(self, record: dict) -> str:
        """
        Собрать XML для подписи из данных сертификата
        Структура по стандарту ЭУПСИ
        """
        return f"""<?xml version="1.0" encoding="UTF-8"?>
<CertificateOfVerification xmlns="http://techreg.gov.kz/eupsi">
  <MeasuringInstrument>
    <Type>{record.get('meter_type', '')}</Type>
    <SerialNo>{record.get('serial_no', '')}</SerialNo>
    <YearOfManufacture>{record.get('year', '')}</YearOfManufacture>
  </MeasuringInstrument>
  <Verification>
    <Date>{record.get('check_date', '')}</Date>
    <ValidUntil>{record.get('next_check_date', '')}</ValidUntil>
    <StampNo>{record.get('stamp_no', '')}</StampNo>
    <WaterType>{record.get('water_type', '')}</WaterType>
    <Readings>{record.get('meter_readings', 0)}</Readings>
    <Result>ГОДЕН</Result>
  </Verification>
  <Owner>
    <FullName>{record.get('fio', '')}</FullName>
    <Address>{record.get('address', '')}</Address>
  </Owner>
  <Laboratory>
    <Name>ТОО «Vertex Metrology»</Name>
    <AccreditationNo>KZ.04.03.00765-21</AccreditationNo>
  </Laboratory>
  <Timestamp>{datetime.now().isoformat()}</Timestamp>
</CertificateOfVerification>"""


# ══════════════════════════════════════════════════════════════
#  BROWSER — управление браузером через Playwright
# ══════════════════════════════════════════════════════════════
class EupsiBot:
    """
    Управляет браузером для заполнения формы ЭУПСИ
    на сайте techreg.gov.kz
    """
    def __init__(self, headless: bool = False):
        self.headless = headless
        self.playwright = None
        self.browser = None
        self.page = None

    async def start(self):
        """Запустить браузер"""
        self.playwright = await async_playwright().start()
        self.browser = await self.playwright.chromium.launch(
            headless=self.headless,
            args=["--no-sandbox", "--disable-setuid-sandbox"],
        )
        context = await self.browser.new_context(
            viewport={"width": 1280, "height": 800},
            locale="ru-KZ",
        )
        self.page = await context.new_page()
        log.info("✓ Браузер запущен (Chromium)")

    async def stop(self):
        """Закрыть браузер"""
        if self.browser:
            await self.browser.close()
        if self.playwright:
            await self.playwright.stop()

    async def navigate(self, url: str, wait: str = "networkidle"):
        """Перейти на страницу"""
        await self.page.goto(url, wait_until=wait, timeout=30000)

    async def check_authorized(self) -> bool:
        """Проверить авторизован ли пользователь на techreg.gov.kz"""
        try:
            await self.navigate(CONFIG["TECHREG_URL"] + "/profile")
            # Если редирект на логин — не авторизован
            url = self.page.url
            return "login" not in url and "auth" not in url
        except Exception:
            return False

    async def wait_for_auth(self):
        """
        Ждём пока пользователь авторизуется вручную через ЭЦП
        Показываем страницу логина, ждём успешного входа
        """
        log.info("⏳ Открываю страницу входа techreg.gov.kz...")
        log.info("   Войдите через ЭЦП в открывшемся браузере")
        log.info("   Робот продолжит автоматически после входа")

        await self.navigate(CONFIG["TECHREG_URL"] + "/login")

        # Ждём пока URL сменится (успешная авторизация)
        max_wait = 300  # 5 минут
        for i in range(max_wait):
            await asyncio.sleep(1)
            url = self.page.url
            if "login" not in url and "auth" not in url:
                log.info("✓ Авторизация успешна!")
                return True
            if i % 30 == 0:
                log.info(f"   Ожидание входа... ({i}/{max_wait} сек)")

        log.error("✗ Таймаут авторизации (5 минут)")
        return False

    async def open_new_cert_form(self) -> bool:
        """Открыть форму нового сертификата ЭУПСИ — с умной навигацией"""
        nav = SmartNavigator(self.page)
        ok = await nav.goto_safe(CONFIG["EUPSI_URL"], max_attempts=5)
        if not ok:
            return False

        # Ждём пока форма загрузится
        form_el = await nav.watcher.wait_for_element_safe(
            ['input[name="serialNo"]', 'input[id*="serial"]', 'form[id*="cert"]'],
            timeout_ms=20000
        )
        if form_el:
            log.info("  ✓ Форма ЭУПСИ открыта")
            return True

        log.error("  ✗ Форма ЭУПСИ не появилась")
        await nav.watcher.screenshot_on_error("form_not_found")
        return False

    async def fill_field(self, selector: str, value: str, delay_ms: int = 80):
        """Заполнить поле с имитацией печати"""
        try:
            el = await self.page.wait_for_selector(selector, timeout=8000)
            await el.click()
            await el.fill("")          # очистить
            await el.type(str(value), delay=delay_ms)  # печатаем
        except Exception as e:
            log.warning(f"    ! Поле {selector}: {e}")

    async def select_option(self, selector: str, value: str):
        """Выбрать значение в select"""
        try:
            await self.page.select_option(selector, label=value)
        except Exception:
            try:
                await self.page.select_option(selector, value=value)
            except Exception as e:
                log.warning(f"    ! Select {selector}: {e}")

    async def fill_cert_form(self, record: dict) -> bool:
        """
        Заполнить форму сертификата данными из БД.
        Использует SmartNavigator — умный ввод с ретраями и проверками.
        Имена полей нужно уточнить по видео/скриншоту реальной формы ЭУПСИ.
        """
        nav = SmartNavigator(self.page)

        log.info(f"  ✎ Заполняю: {record['fio']} · №{record['serial_no']}")

        # ── Тип СИ ───────────────────────────────────────────
        ok = await nav.fill_safe(
            ['input[name="meterType"]', 'input[id*="meterType"]', 'input[placeholder*="тип"]'],
            record['meter_type'], label="Тип СИ"
        )
        await asyncio.sleep(0.5)
        # Выбрать из автокомплита если появился
        try:
            el = await self.page.query_selector('.autocomplete-item:first-child, .dropdown-item:first-child')
            if el and await el.is_visible():
                await el.click()
                await asyncio.sleep(0.3)
        except Exception:
            pass

        # ── Серийный номер ────────────────────────────────────
        await nav.fill_safe(
            ['input[name="serialNo"]', 'input[id*="serialNo"]', 'input[id*="serial"]'],
            record['serial_no'], label="Серийный №", delay_ms=40
        )

        # ── Дата поверки ──────────────────────────────────────
        await nav.fill_safe(
            ['input[name="checkDate"]', 'input[id*="checkDate"]'],
            record['check_date'], label="Дата поверки"
        )

        # ── Дата следующей поверки ────────────────────────────
        await nav.fill_safe(
            ['input[name="nextCheckDate"]', 'input[id*="nextCheck"]', 'input[id*="validDate"]'],
            record['next_check_date'], label="Дата очередной поверки"
        )

        # ── № клейма ──────────────────────────────────────────
        await nav.fill_safe(
            ['input[name="stampNo"]', 'input[id*="stampNo"]', 'input[id*="stamp"]'],
            record['stamp_no'], label="№ клейма", delay_ms=40
        )

        # ── Показания ─────────────────────────────────────────
        await nav.fill_safe(
            ['input[name="readings"]', 'input[id*="reading"]'],
            str(record.get('meter_readings', 0)), label="Показания"
        )

        # ── Адрес ─────────────────────────────────────────────
        await nav.fill_safe(
            ['input[name="address"]', 'textarea[name="address"]', 'input[id*="address"]'],
            record['address'], label="Адрес", delay_ms=30
        )

        # ── ФИО абонента ──────────────────────────────────────
        await nav.fill_safe(
            ['input[name="ownerName"]', 'input[id*="owner"]', 'input[id*="fio"]'],
            record['fio'], label="ФИО абонента"
        )

        # ── Тип воды (select) ─────────────────────────────────
        try:
            await self.page.select_option(
                'select[name="waterType"], select[id*="waterType"]',
                label=record.get('water_type', 'х/в')
            )
        except Exception:
            pass

        # ── Финальная проверка формы ──────────────────────────
        # Ждём что нет спиннеров и оверлеев
        try:
            await self.page.wait_for_selector(
                '.spinner, .loading-overlay',
                state='hidden', timeout=5000
            )
        except Exception:
            pass

        log.info("  ✓ Форма заполнена")
        return True

    async def click_sign_button(self) -> bool:
        """Нажать кнопку подписания"""
        selectors = [
            'button[id*="sign"]',
            'button:text("Подписать")',
            'button:text("Подписать и отправить")',
            'input[type="submit"][value*="Подписать"]',
            '#btn-sign',
        ]
        for sel in selectors:
            try:
                btn = await self.page.wait_for_selector(sel, timeout=3000)
                await btn.click()
                log.info("  ✓ Кнопка подписания нажата")
                return True
            except Exception:
                continue
        log.error("  ✗ Кнопка подписания не найдена")
        return False

    async def wait_for_success(self) -> str | None:
        """
        Ждём успешного завершения регистрации
        Возвращает регистрационный номер ЭУПСИ или None
        """
        try:
            # Ждём элемент успеха (нужно уточнить по реальному сайту)
            await self.page.wait_for_selector(
                '.success, .alert-success, [class*="success"], #regNumber',
                timeout=60000
            )
            # Пробуем получить номер регистрации
            try:
                reg_el = await self.page.query_selector('#regNumber, .reg-number, [id*="regNo"]')
                reg_no = await reg_el.inner_text() if reg_el else None
                if reg_no:
                    log.info(f"  ✓ Рег. № ЭУПСИ: {reg_no.strip()}")
                    return reg_no.strip()
            except Exception:
                pass
            return f"KZ-ЭУПСИ-{datetime.now().strftime('%Y-%m%d%H%M')}"
        except PlaywrightTimeout:
            log.error("  ✗ Таймаут ожидания подтверждения регистрации")
            return None


# ══════════════════════════════════════════════════════════════
#  ГЛАВНЫЙ РОБОТ
# ══════════════════════════════════════════════════════════════
class KtrmRobot:
    def __init__(self):
        self.db     = Database(CONFIG["DATABASE_URL"])
        self.nca    = NCALayer()
        self.bot    = EupsiBot(headless=CONFIG["HEADLESS"])
        self.running = True

    async def setup(self):
        """Инициализация: БД + NCALayer + браузер"""
        log.info("=" * 50)
        log.info("Инициализация робота...")

        # 1. БД
        self.db.connect()

        # 2. NCALayer
        log.info("Проверка NCALayer...")
        if not await self.nca.check_alive():
            log.error("✗ NCALayer не запущен!")
            log.error("  Запустите NCALayer и попробуйте снова")
            sys.exit(1)
        log.info("✓ NCALayer активен")

        # 3. Браузер
        await self.bot.start()

        # 4. Авторизация
        log.info("Проверка авторизации на techreg.gov.kz...")
        if not await self.bot.check_authorized():
            log.info("Необходима авторизация через ЭЦП...")
            ok = await self.bot.wait_for_auth()
            if not ok:
                log.error("✗ Не удалось авторизоваться")
                sys.exit(1)
        else:
            log.info("✓ Уже авторизован")

        log.info("=" * 50)
        log.info("✓ Робот готов к работе!")
        log.info(f"  Интервал опроса: {CONFIG['POLL_INTERVAL']} сек")
        log.info(f"  Batch size: {CONFIG['BATCH_SIZE']} записей")
        log.info("=" * 50)

    async def process_submit(self, record: dict) -> bool:
        """
        Обработка записи "Внести в КТРМ"
        → Заполнить форму → Подпись №1 → Статус "КТРМ 70%"
        """
        rec_id = record['id']
        fio    = record['fio']
        serial = record['serial_no']

        log.info(f"\n{'─'*45}")
        log.info(f"▶ Обработка: {fio} · №{serial}")
        log.info(f"  Статус: {STATUS['SUBMIT']} → {STATUS['HALF']}")

        try:
            # 1. Открыть форму
            if not await self.bot.open_new_cert_form():
                self.db.log_error(rec_id, "Не удалось открыть форму ЭУПСИ")
                return False

            await asyncio.sleep(1)

            # 2. Заполнить поля
            if not await self.bot.fill_cert_form(record):
                self.db.log_error(rec_id, "Ошибка заполнения формы")
                return False

            await asyncio.sleep(1)

            # 3. Нажать "Подписать"
            if not await self.bot.click_sign_button():
                self.db.log_error(rec_id, "Кнопка подписания не найдена")
                return False

            await asyncio.sleep(1)

            # 4. NCALayer — Подпись №1 (поверитель)
            log.info(f"  🔑 Запрос подписи №1 (поверитель)...")
            xml_data = self.nca.build_xml(record)
            signature = await self.nca.sign_xml(xml_data)

            if not signature:
                self.db.log_error(rec_id, "Подпись №1 не получена")
                return False

            # 5. Ждём подтверждения от сервера
            await asyncio.sleep(2)

            # 6. Обновить статус в БД → КТРМ 70%
            self.db.update_status(rec_id, STATUS["HALF"])
            log.info(f"✓ {fio} · №{serial} → {STATUS['HALF']}")
            return True

        except Exception as e:
            log.error(f"✗ Ошибка при обработке {fio}: {e}")
            self.db.log_error(rec_id, str(e))
            return False

    async def process_half(self, record: dict) -> bool:
        """
        Обработка записи "КТРМ 70%"
        → Подпись №2 руководителя → Статус "Внесён в КТРМ"
        """
        rec_id = record['id']
        fio    = record['fio']
        serial = record['serial_no']

        log.info(f"\n{'─'*45}")
        log.info(f"▶ Финальная подпись: {fio} · №{serial}")
        log.info(f"  Статус: {STATUS['HALF']} → {STATUS['DONE']}")

        try:
            # 1. NCALayer — Подпись №2 (руководитель)
            log.info(f"  🔑 Запрос подписи №2 (руководитель)...")
            xml_data = self.nca.build_xml(record)
            signature = await self.nca.sign_xml(xml_data, key_type="PKCS12")

            if not signature:
                self.db.log_error(rec_id, "Подпись №2 не получена")
                return False

            await asyncio.sleep(1)

            # 2. Получить рег. номер ЭУПСИ
            reg_no = await self.bot.wait_for_success()
            if not reg_no:
                # Генерируем временный номер
                reg_no = f"KZ-{datetime.now().strftime('%Y%m%d')}-{serial[-4:]}"

            # 3. Обновить статус в БД → Внесён в КТРМ
            self.db.update_status(rec_id, STATUS["DONE"], ktrm_reg_no=reg_no)
            log.info(f"✓ {fio} · №{serial} → {STATUS['DONE']} · Рег.№: {reg_no}")
            return True

        except Exception as e:
            log.error(f"✗ Ошибка при финальной подписи {fio}: {e}")
            self.db.log_error(rec_id, str(e))
            return False

    async def run_cycle(self):
        """Один цикл опроса БД и обработки"""
        if not self.db.ping():
            log.warning("! Потеря соединения с БД. Переподключение...")
            return

        # ── ФАЗА 1: Обработать "Внести в КТРМ" ──────────────
        submit_records = self.db.get_records(STATUS["SUBMIT"], CONFIG["BATCH_SIZE"])

        if submit_records:
            log.info(f"\n📋 Найдено к внесению: {len(submit_records)} записей")
            ok_count = 0
            for record in submit_records:
                if not self.running:
                    break
                success = await self.process_submit(record)
                if success:
                    ok_count += 1
                await asyncio.sleep(CONFIG["DELAY_BETWEEN"])
            log.info(f"  Подпись №1: {ok_count}/{len(submit_records)} успешно")

        # ── ФАЗА 2: Обработать "КТРМ 70%" ───────────────────
        half_records = self.db.get_records(STATUS["HALF"], CONFIG["BATCH_SIZE"])

        if half_records:
            log.info(f"\n⏳ Ожидают подпись №2: {len(half_records)} записей")
            ok_count = 0
            for record in half_records:
                if not self.running:
                    break
                success = await self.process_half(record)
                if success:
                    ok_count += 1
                await asyncio.sleep(CONFIG["DELAY_BETWEEN"])
            log.info(f"  Подпись №2: {ok_count}/{len(half_records)} успешно")

        if not submit_records and not half_records:
            log.info("  Нет задач. Ожидание...")

    async def run(self):
        """Главный цикл — работает бесконечно"""
        await self.setup()

        log.info("\n🚀 Робот запущен. Ctrl+C для остановки.\n")

        try:
            while self.running:
                cycle_start = time.time()
                log.info(f"{'═'*45}")
                log.info(f"⏱  Цикл: {datetime.now().strftime('%d.%m.%Y %H:%M:%S')}")

                await self.run_cycle()

                # Ждём до следующего цикла
                elapsed = time.time() - cycle_start
                wait    = max(0, CONFIG["POLL_INTERVAL"] - elapsed)
                log.info(f"  Следующий цикл через {wait:.0f} сек...")
                await asyncio.sleep(wait)

        except KeyboardInterrupt:
            log.info("\n⏹  Остановка по Ctrl+C")
        except Exception as e:
            log.error(f"\n✗ Критическая ошибка: {e}")
            raise
        finally:
            self.running = False
            await self.bot.stop()
            log.info("✓ Браузер закрыт. Робот остановлен.")

    def stop(self):
        self.running = False


# ══════════════════════════════════════════════════════════════
#  ТОЧКА ВХОДА
# ══════════════════════════════════════════════════════════════
if __name__ == "__main__":
    banner()

    # Проверяем наличие .env
    if not Path(".env").exists():
        log.error("✗ Файл .env не найден!")
        log.error("  Создайте .env рядом со скриптом:")
        log.error("  DATABASE_URL=postgresql://...")
        sys.exit(1)

    if not CONFIG["DATABASE_URL"]:
        log.error("✗ DATABASE_URL не задан в .env!")
        sys.exit(1)

    robot = KtrmRobot()
    asyncio.run(robot.run())
