// «Недавние значения» для полей с автокомплитом — верхняя секция подсказок,
// НЕ отдельный механизм. Хранение: localStorage, ключ user+поле, максимум 5,
// дубль поднимается наверх. Запись добавляется при УСПЕШНОМ сохранении записи
// (сертификата/продажи), а не при простом наборе.

export type RecentItem = { v: string; m?: string };   // v = значение, m = мета (тип/kind)

const MAX = 5;
const key = (field: string, uid?: string | null) => `recent:${field}:${uid || 'anon'}`;
const norm = (s: string) => s.trim().toLowerCase();

// Чистое слияние (тестируемо): дубль по значению (без регистра) поднимается
// наверх, длина ограничена max.
export function mergeRecent(list: RecentItem[], item: RecentItem, max = MAX): RecentItem[] {
  const v = item.v.trim();
  if (!v) return list.slice(0, max);
  const rest = list.filter(x => norm(x.v) !== norm(v));
  return [{ ...item, v }, ...rest].slice(0, max);
}

export function getRecent(field: string, uid?: string | null): RecentItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const a = JSON.parse(localStorage.getItem(key(field, uid)) || '[]');
    return Array.isArray(a) ? a.filter((x: unknown): x is RecentItem => !!x && typeof (x as RecentItem).v === 'string').slice(0, MAX) : [];
  } catch { return []; }
}

export function pushRecent(field: string, uid: string | null | undefined, item: RecentItem): RecentItem[] {
  const next = mergeRecent(getRecent(field, uid), item);
  if (typeof window !== 'undefined') { try { localStorage.setItem(key(field, uid), JSON.stringify(next)); } catch { /* quota/off */ } }
  return next;
}

export function removeRecent(field: string, uid: string | null | undefined, v: string): RecentItem[] {
  const next = getRecent(field, uid).filter(x => norm(x.v) !== norm(v));
  if (typeof window !== 'undefined') { try { localStorage.setItem(key(field, uid), JSON.stringify(next)); } catch { /* off */ } }
  return next;
}
