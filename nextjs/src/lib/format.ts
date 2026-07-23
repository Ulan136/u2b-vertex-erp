// Единый формат дат интерфейса: ДД.ММ.ГГГГ (23.07.2026) и ДД.ММ.ГГГГ ЧЧ:ММ.
// В БД даты хранятся в ISO (не трогаем); <input type="date"> имеет свой формат.
const pad = (n: number) => String(n).padStart(2, '0');

// Дата → «ДД.ММ.ГГГГ». Пусто/невалид → ''.
// Строку-ISO (YYYY-MM-DD…) режем как текст (без сдвига часового пояса);
// Date/timestamp — по ЛОКАЛЬНЫМ частям.
export function formatDate(d?: string | number | Date | null): string {
  if (d == null || d === '') return '';
  if (typeof d === 'string') {
    const s = d.slice(0, 10); const p = s.split('-');
    if (p.length === 3 && p[0].length === 4) return `${p[2]}.${p[1]}.${p[0]}`;
    const dt = new Date(d); return isNaN(dt.getTime()) ? '' : `${pad(dt.getDate())}.${pad(dt.getMonth() + 1)}.${dt.getFullYear()}`;
  }
  const dt = new Date(d); return isNaN(dt.getTime()) ? '' : `${pad(dt.getDate())}.${pad(dt.getMonth() + 1)}.${dt.getFullYear()}`;
}

// Время → «ЧЧ:ММ» (локальное). Пусто/невалид → ''.
export function formatTime(d?: string | number | Date | null): string {
  if (d == null || d === '') return '';
  const dt = new Date(d as string | number | Date);
  return isNaN(dt.getTime()) ? '' : `${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

// Дата и время → «ДД.ММ.ГГГГ ЧЧ:ММ» (локальное). Пусто/невалид → ''.
export function formatDateTime(d?: string | number | Date | null): string {
  if (d == null || d === '') return '';
  const dt = new Date(d as string | number | Date);
  if (isNaN(dt.getTime())) return typeof d === 'string' ? formatDate(d) : '';
  return `${pad(dt.getDate())}.${pad(dt.getMonth() + 1)}.${dt.getFullYear()} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}
