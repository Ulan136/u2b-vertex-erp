# U2B-Vertex ERP
## Автоматизация бизнес-процессов — ТОО «Vertex Metrology»

> Шымкент, Казахстан · Поверка счётчиков воды · Sprint 0

---

## Файлы прототипа

| Файл | Назначение |
|------|-----------|
| `login.html` | Экран входа (все роли, быстрый вход, запомнить пароль) |
| `sketch_screens.html` | **Главный ERP** — все модули, сертификаты, счета |
| `director_mobile.html` | Мобильный кабинет директора |
| `mobile_master.html` | Мобильный кабинет выездного мастера |
| `finance_module.html` | Финансовый трекер (U-Pay) |
| `roles_settings.html` | Управление ролями и доступами |
| `archive_and_deadlines.html` | База данных: архив + сроки счётчиков |
| `sitemap.html` | Карта сайта |
| `rashody.html` | Модуль расходов |
| `sertifikat_sami.html` | Сертификаты САМИ (отдельный экран) |
| `TZ_U2B_Vertex_ERP_v2.md` | Техническое задание v2.0 |
| `ktrm_robot_architecture.md` | Архитектура робота е-КТРМ |

---

## Тестовые аккаунты

| Email | Пароль | Роль | Редирект |
|-------|--------|------|---------|
| m@vertex.kz | admin123 | 👑 Админ | sketch_screens.html |
| k@vertex.kz | manager123 | 💼 Менеджер | sketch_screens.html |
| director@vertex.kz | director123 | 📊 Директор | director_mobile.html |
| s@vertex.kz | field123 | 🚗 Мастер | mobile_master.html |

---

## Стек (продакшн — Sprint 1+)

```
Frontend:  Next.js 14 (App Router)
Database:  Neon PostgreSQL
ORM:       Drizzle ORM
Auth:      NextAuth.js
Deploy:    Vercel + GitHub Actions
Robot:     Python + Playwright (е-КТРМ RPA)
```

---

## Статус спринтов

- ✅ **Sprint 0** — HTML прототипы (текущий)
- ⏳ **Sprint 1** — Next.js + Neon + Auth
- ⏳ **Sprint 2** — CRUD сертификатов
- ⏳ **Sprint 3** — Финансы в БД
- ⏳ **Sprint 4** — Робот е-КТРМ (.exe)
- ⏳ **Sprint 5** — PWA + Push + Отчёты

---

*© 2026 U2B-Vertex · ТОО «Vertex Metrology»*
