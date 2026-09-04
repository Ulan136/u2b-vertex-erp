// Вычисляемые «скрытые» долги (без записи в ручной реестр Долгов):
//   — мы должны поставщикам = закупы «В долг» (движения IN без finance_group);
//   — нам должны = продажи (остаток) + поверки «в ожидании» с ценой.
// Чистые функции, переиспользуются на дашборде и в Финансах.

const num = (v: unknown) => Number(v) || 0;
// Возврат из продаж — тоже приход (IN), но НЕ закуп (как на экране Закупок).
const isSalesReturn = (m: { comment?: string | null }) => /возврат|отмена продажи/i.test(m.comment || '');

export type MoveLite = { id?: string; purchaseGroup?: string | null; totalSum?: string | number; qty?: number; price?: string | number; supplier?: string | null; comment?: string | null; financeGroup?: string | null; reversedAt?: string | null };
export type SaleLite = { totalSum?: string | number; paidSum?: string | number; cancelledAt?: string | null };
export type CertLite = { payStatus?: string | null; amount?: string | number | null };
export type OpLite = { opType?: string | null; source?: string | null; expenseGroupId?: string | null; amount?: string | number; reversedAt?: string | null; reverses?: string | null };

// Сумма уже оплаченного по каждому долгу-закупу (частичные погашения). Ключ =
// expense_group_id операции = debtKey закупа (purchaseGroup или id движения).
export function paidByDebtKey(ops?: OpLite[]): Record<string, number> {
  const paid: Record<string, number> = {};
  for (const o of ops || []) {
    if (o.opType !== 'Расход' || o.source !== 'Закуп' || o.reversedAt || o.reverses) continue;
    const g = o.expenseGroupId; if (!g) continue;
    paid[g] = (paid[g] || 0) + num(o.amount);
  }
  return paid;
}

// Долг поставщикам: закупы «В долг» (нет finance_group = не закрыты полностью).
// С учётом ЧАСТИЧНЫХ погашений (ops): из стоимости группы вычитаем уже оплаченное.
// Итог + разбивка по поставщикам (по убыванию суммы остатка).
export function purchaseDebts(movs: MoveLite[], ops?: OpLite[]) {
  const costOf = (m: MoveLite) => num(m.totalSum) || num(m.qty) * num(m.price);
  const live = (movs || []).filter(m => !m.reversedAt && !m.financeGroup && !isSalesReturn(m));
  const paid = paidByDebtKey(ops);
  // группируем позиции по долгу (мультизакуп делит purchaseGroup)
  const groups: Record<string, { cost: number; supplier: string }> = {};
  for (const m of live) {
    const key = m.purchaseGroup || m.id || '';
    (groups[key] ||= { cost: 0, supplier: (m.supplier || '').trim() || 'Без поставщика' }).cost += costOf(m);
  }
  const by: Record<string, number> = {};
  let total = 0, count = 0;
  for (const [key, g] of Object.entries(groups)) {
    const remaining = Math.max(0, Math.round((g.cost - (paid[key] || 0)) * 100) / 100);
    if (remaining <= 0.005) continue;   // погашен полностью частичными оплатами
    total += remaining; count++;
    by[g.supplier] = (by[g.supplier] || 0) + remaining;
  }
  const bySupplier = Object.entries(by).map(([supplier, amount]) => ({ supplier, amount })).sort((a, b) => b.amount - a.amount);
  return { total: Math.round(total * 100) / 100, bySupplier, count };
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
