// P1-5 дизайн-брифа: единый словарь статусов — один смысл = один цвет на всех
// экранах. Раньше «Ожидает оплаты» был оранжевым в продажах/сертификатах, но
// красным на дашборде. Ожидание — это ПРЕДУПРЕЖДЕНИЕ (warn), а не ошибка (err).

export type StatusTone = 'ok' | 'warn' | 'err' | 'info' | 'neutral';

// Тона → цвета (совпадают с компонентом Badge и раскраской по проекту).
export const TONE_COLOR: Record<StatusTone, string> = {
  ok: '#16a34a', warn: '#b45309', err: '#dc2626', info: '#1d4ed8', neutral: '#64748b',
};

// Оплата: канонический тон по строке статуса (из БД или вычисленного).
//   Оплачено → ok · Бесплатно → neutral · Просрочено → err ·
//   Ожидает / В ожидании / Частично → warn.
export function payTone(status?: string | null): StatusTone {
  const s = (status || '').toLowerCase();
  if (s.indexOf('оплачен') !== -1) return 'ok';
  if (s.indexOf('бесплат') !== -1) return 'neutral';
  if (s.indexOf('просроч') !== -1) return 'err';
  return 'warn';
}
export const payColor = (status?: string | null): string => TONE_COLOR[payTone(status)];
