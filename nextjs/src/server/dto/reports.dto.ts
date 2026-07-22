// Отчёты по сотрудникам — чистые функции периода и агрегации (без БД, тестируемые).

export type Period = { preset: string; from?: string | null; to?: string | null };
export const REPORT_PRESETS = ['today', '7d', 'month', 'quarter', 'custom'] as const;

// Диапазон дат [from,to] (YYYY-MM-DD) по пресету. `now` вычисляется вызывающим
// (передаётся как ISO-дата), чтобы функция оставалась чистой и тестируемой.
export function periodRange(p: Period, todayISO: string): { from: string; to: string } {
  const t = String(todayISO).slice(0, 10);
  const d = new Date(t + 'T00:00:00Z');
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  const shift = (days: number) => { const c = new Date(d); c.setUTCDate(c.getUTCDate() + days); return iso(c); };
  switch (p.preset) {
    case 'today': return { from: t, to: t };
    case '7d': return { from: shift(-6), to: t };
    case 'month': return { from: iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))), to: t };
    case 'quarter': { const q = Math.floor(d.getUTCMonth() / 3) * 3; return { from: iso(new Date(Date.UTC(d.getUTCFullYear(), q, 1))), to: t }; }
    case 'custom': return { from: (p.from || t).slice(0, 10), to: (p.to || t).slice(0, 10) };
    default: return { from: iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))), to: t };
  }
}

export function withinPeriod(dateISO: string | null | undefined, from: string, to: string): boolean {
  if (!dateISO) return false;
  const d = String(dateISO).slice(0, 10);
  return d >= from && d <= to;
}

export type EmployeeRow = {
  userId: string; name: string; role: string;
  salesCount: number; salesSum: number;
  certCount: number; certBySource: Record<string, number>;
  ordersClosed: number; tasksDone: number; expenseSum: number; totalActions: number;
};

type CountSum = { count: number; sum: number };
export type EmployeeAggregates = {
  sales?: Record<string, CountSum>;      // uid → {count, sum}
  certs?: Record<string, number>;        // uid → шт
  certSrc?: Record<string, Record<string, number>>;   // uid → {источник: шт}
  orders?: Record<string, number>;       // uid → заявки (действия из audit)
  tasks?: Record<string, number>;        // uid → выполнено
  expenses?: Record<string, number>;     // uid → сумма расходов
  actions?: Record<string, number>;      // uid → всего действий
};

// Свести агрегаты (каждый — результат SQL group by) в строки по сотрудникам.
// Пользователи без активности тоже попадают (нули), сортировка — по всего действий.
export function mergeEmployeeRows(users: Array<{ id: string; name: string; role: string }>, a: EmployeeAggregates): EmployeeRow[] {
  const rows = users.map(u => ({
    userId: u.id, name: u.name, role: u.role,
    salesCount: a.sales?.[u.id]?.count ?? 0,
    salesSum: a.sales?.[u.id]?.sum ?? 0,
    certCount: a.certs?.[u.id] ?? 0,
    certBySource: a.certSrc?.[u.id] ?? {},
    ordersClosed: a.orders?.[u.id] ?? 0,
    tasksDone: a.tasks?.[u.id] ?? 0,
    expenseSum: a.expenses?.[u.id] ?? 0,
    totalActions: a.actions?.[u.id] ?? 0,
  }));
  return rows.sort((x, y) => y.totalActions - x.totalActions || y.salesSum - x.salesSum);
}

// Слить дневные ряды продаж и сертификатов в единый ряд по дням (для графика «Динамика»).
export function buildDynamics(
  sales: Array<{ day: string; sum: number; count?: number }>,
  certs: Array<{ day: string; count: number }>,
): Array<{ day: string; salesSum: number; certCount: number }> {
  const map: Record<string, { salesSum: number; certCount: number }> = {};
  for (const s of sales) (map[s.day] ||= { salesSum: 0, certCount: 0 }).salesSum += Number(s.sum) || 0;
  for (const c of certs) (map[c.day] ||= { salesSum: 0, certCount: 0 }).certCount += Number(c.count) || 0;
  return Object.keys(map).sort().map(day => ({ day, ...map[day] }));
}
