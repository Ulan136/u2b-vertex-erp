// Вычисляемые «скрытые» долги (без записи в ручной реестр Долгов):
//   — мы должны поставщикам = закупы «В долг» (движения IN без finance_group);
//   — нам должны = продажи (остаток) + поверки «в ожидании» с ценой.
// Чистые функции, переиспользуются на дашборде и в Финансах.

const num = (v: unknown) => Number(v) || 0;
// Возврат из продаж — тоже приход (IN), но НЕ закуп (как на экране Закупок).
const isSalesReturn = (m: { comment?: string | null }) => /возврат|отмена продажи/i.test(m.comment || '');

export type MoveLite = { totalSum?: string | number; qty?: number; price?: string | number; supplier?: string | null; comment?: string | null; financeGroup?: string | null; reversedAt?: string | null };
export type SaleLite = { totalSum?: string | number; paidSum?: string | number; cancelledAt?: string | null };
export type CertLite = { payStatus?: string | null; amount?: string | number | null };

// Долг поставщикам: закупы «В долг» (не оплачены = нет finance_group, не отменены,
// не возвраты). Итог + разбивка по поставщикам (по убыванию суммы).
export function purchaseDebts(movs: MoveLite[]) {
  const costOf = (m: MoveLite) => num(m.totalSum) || num(m.qty) * num(m.price);
  const live = (movs || []).filter(m => !m.reversedAt && !m.financeGroup && !isSalesReturn(m));
  const total = live.reduce((s, m) => s + costOf(m), 0);
  const by: Record<string, number> = {};
  for (const m of live) { const k = (m.supplier || '').trim() || 'Без поставщика'; by[k] = (by[k] || 0) + costOf(m); }
  const bySupplier = Object.entries(by).map(([supplier, amount]) => ({ supplier, amount })).sort((a, b) => b.amount - a.amount);
  return { total, bySupplier, count: live.length };
}

// Нам должны (ожидаемые поступления): по продажам — точный остаток
// (итог − оплачено, вкл. частичные), по поверкам — «В ожидании» с указанной ценой.
export function pendingReceivables(sales: SaleLite[], certs: CertLite[]) {
  const liveSales = (sales || []).filter(s => !s.cancelledAt);
  const salesTotal = liveSales.reduce((s, x) => s + Math.max(0, num(x.totalSum) - num(x.paidSum)), 0);
  const salesCount = liveSales.filter(x => num(x.totalSum) - num(x.paidSum) > 0.005).length;
  const certsPend = (certs || []).filter(c => c.payStatus === 'В ожидании' && num(c.amount) > 0);
  const certsTotal = certsPend.reduce((s, c) => s + num(c.amount), 0);
  return { total: salesTotal + certsTotal, salesTotal, salesCount, certsTotal, certsCount: certsPend.length };
}
