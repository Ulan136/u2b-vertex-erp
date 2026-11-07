// Города, карты и ссылки «открыть / проехать» — одно место на всю систему.
//
// Зачем общий файл: адрес живёт в заявке, в таблице заявок и в кабинете мастера
// на телефоне. Раньше каждый экран строил ссылку сам, и они разошлись: заявка
// открывала 2ГИС поиском по строке, список — тоже, а «Маршрут» уводил в Яндекс
// по координатам. Теперь правило одно.

/** Город, в котором работает компания. `center` нужен карте при открытии. */
export const CITIES = [
  { key: 'taraz',  label: 'Тараз',  center: [42.90000, 71.36667] as [number, number] },
  { key: 'astana', label: 'Астана', center: [51.12820, 71.43070] as [number, number] },
  { key: 'almaty', label: 'Алматы', center: [43.23890, 76.88970] as [number, number] },
] as const;

export type CityKey = (typeof CITIES)[number]['key'];

export const cityCenter = (key: string): [number, number] =>
  (CITIES.find(c => c.key === key) || CITIES[0]).center;

export const cityLabel = (key: string): string =>
  (CITIES.find(c => c.key === key) || CITIES[0]).label;

// Город по умолчанию = город филиала, в контексте которого открыт экран.
// Принимает и slug из URL (?branch=astana), и раздел счёта филиала
// (financeSection='branch'|'branch_almaty'), чтобы вызывающему не нужно было
// знать, какой из двух языков у него под рукой. Головной офис — Тараз.
export function cityOfBranch(branch?: string | null): CityKey {
  const b = String(branch || '').toLowerCase();
  if (b === 'astana' || b === 'branch') return 'astana';
  if (b === 'almaty' || b === 'branch_almaty') return 'almaty';
  return 'taraz';
}

// Город по координатам: нужен, чтобы при открытии уже заполненного адреса
// чип города встал на правильный, а не на «Тараз» по умолчанию. Берём
// ближайший центр — города разнесены на сотни км, спутать их нельзя.
export function cityOfCoords(lat?: number | null, lng?: number | null): CityKey | null {
  if (lat == null || lng == null) return null;
  let best: CityKey | null = null;
  let bestD = Infinity;
  for (const c of CITIES) {
    const d = (c.center[0] - lat) ** 2 + (c.center[1] - lng) ** 2;
    if (d < bestD) { bestD = d; best = c.key; }
  }
  return best;
}

// ── Адрес «до подъезда» ───────────────────────────────────────
// Геокодер Яндекса знает дом, но НЕ знает подъездов и квартир — их дописывает
// менеджер. Храним это в той же строке адреса (отдельных колонок в заявке нет),
// поэтому нужны разбор и сборка: при повторном открытии хвосты должны вернуться
// в свои поля, а не продублироваться в адресе.
export type AddrParts = { base: string; entrance: string; floor: string; flat: string };

// «кв» требует цифру сразу после себя: иначе regexp съедает улицу
// «Квартальная» как квартиру. «подъезд» и «этаж» — целые слова, им цифра не нужна.
const RE_ENTRANCE = /,\s*подъезд\s*([^,]+)/i;
const RE_FLOOR = /,\s*этаж\s*([^,]+)/i;
const RE_FLAT = /,\s*кв\.?\s*(\d[^,]*)/i;

export function splitAddress(full?: string | null): AddrParts {
  let base = String(full || '').trim();
  const take = (re: RegExp): string => {
    const m = base.match(re);
    if (!m) return '';
    base = (base.slice(0, m.index) + base.slice((m.index || 0) + m[0].length)).trim().replace(/,\s*$/, '');
    return (m[1] || '').trim();
  };
  // Снимаем в порядке от самого «узкого»: «кв.» ищем после «подъезд», иначе
  // regexp квартиры может зацепить часть хвоста подъезда.
  const flat = take(RE_FLAT);
  const floor = take(RE_FLOOR);
  const entrance = take(RE_ENTRANCE);
  return { base, entrance, floor, flat };
}

export function joinAddress(p: AddrParts): string {
  const t = (s?: string) => String(s || '').trim();
  return [
    t(p.base),
    t(p.entrance) && `подъезд ${t(p.entrance)}`,
    t(p.floor) && `этаж ${t(p.floor)}`,
    t(p.flat) && `кв. ${t(p.flat)}`,
  ].filter(Boolean).join(', ');
}

// Геокодер Яндекса отдаёт адрес с головы: «Казахстан, Астана, улица Кенесары, 42».
// Страна в заявке не нужна (мы не работаем за пределами Казахстана), а лишние
// слова мешают мастеру читать адрес на телефоне одной строкой.
export function tidyAddress(line?: string | null): string {
  return String(line || '').trim()
    .replace(/^Казахстан\s*,\s*/i, '')
    .replace(/^Қазақстан\s*,\s*/i, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/^,\s*|,\s*$/g, '');
}

// ── Ссылки на карты ───────────────────────────────────────────
// Координаты точнее строки: по адресу навигатор ищет улицу и может увести в
// другой конец города (а в Казахстане одноимённые улицы есть почти всюду), по
// метке — ведёт ровно туда, куда ткнул менеджер. Поэтому везде: есть метка —
// идём по метке, нет — поиском по строке.
//
// ⚠️ Порядок координат у сервисов РАЗНЫЙ:
//   2ГИС и параметр `ll` Яндекса — ДОЛГОТА,ШИРОТА;
//   параметр `rtext` Яндекса — ШИРОТА,ДОЛГОТА.
// Домены казахстанские (2gis.ru/yandex.ru отдают редирект).
const q = (s?: string | null) => encodeURIComponent(String(s || '').trim());
const has = (lat?: number | null, lng?: number | null) => lat != null && lng != null;

/** Посмотреть точку/адрес в 2ГИС. */
export function gisViewUrl(address?: string | null, lat?: number | null, lng?: number | null): string {
  return has(lat, lng) ? `https://2gis.kz/geo/${lng},${lat}` : `https://2gis.kz/search/${q(address)}`;
}

/** Посмотреть точку/адрес в Яндекс.Картах. */
export function yandexViewUrl(address?: string | null, lat?: number | null, lng?: number | null): string {
  return has(lat, lng)
    ? `https://yandex.kz/maps/?ll=${lng},${lat}&z=18&pt=${lng},${lat}`
    : `https://yandex.kz/maps/?text=${q(address)}`;
}

/** Маршрут на машине в 2ГИС (от текущего места — пустая первая точка). */
export function gisRouteUrl(address?: string | null, lat?: number | null, lng?: number | null): string {
  return has(lat, lng)
    ? `https://2gis.kz/directions/points/%7C${lng},${lat}`
    : `https://2gis.kz/search/${q(address)}`;
}

/** Маршрут на машине в Яндекс.Навигаторе / Картах. */
export function yandexRouteUrl(address?: string | null, lat?: number | null, lng?: number | null): string {
  return has(lat, lng)
    ? `https://yandex.kz/maps/?rtext=~${lat},${lng}&rtt=auto`
    : `https://yandex.kz/maps/?text=${q(address)}&rtt=auto`;
}

/** Навигаторы, между которыми выбирает мастер. */
export const NAVIGATORS = [
  { key: 'gis', label: '2ГИС', route: gisRouteUrl },
  { key: 'yandex', label: 'Яндекс', route: yandexRouteUrl },
] as const;
