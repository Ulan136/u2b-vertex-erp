import { reportsRepo } from '@/server/repositories/reports.repo';
import { mergeEmployeeRows, buildDynamics, type EmployeeAggregates } from '@/server/dto/reports.dto';
import { badRequest } from '@/server/lib/errors';

const mapCnt = (rows: Array<{ uid: string; cnt: number }>): Record<string, number> =>
  Object.fromEntries(rows.map(r => [r.uid, Number(r.cnt) || 0]));

// from/to обязательны (клиент считает пресет периода и передаёт даты).
function ensureRange(from?: string | null, to?: string | null): { from: string; to: string } {
  if (!from || !to) throw badRequest('Нужен период (from, to)');
  return { from: String(from).slice(0, 10), to: String(to).slice(0, 10) };
}

export const reportsService = {
  async analytics(fromRaw?: string | null, toRaw?: string | null) {
    const { from, to } = ensureRange(fromRaw, toRaw);
    const [users, salesRows, certRows, taskRows, expRows, orderRows, actionRows, salesDaily, certsDaily] = await Promise.all([
      reportsRepo.activeUsers(),
      reportsRepo.salesByUser(from, to),
      reportsRepo.certsByUser(from, to),
      reportsRepo.tasksByUser(from, to),
      reportsRepo.expensesByUser(from, to),
      reportsRepo.ordersByUser(from, to),
      reportsRepo.actionsByUser(from, to),
      reportsRepo.salesDaily(from, to),
      reportsRepo.certsDaily(from, to),
    ]);

    const sales: Record<string, { count: number; sum: number }> = {};
    for (const r of salesRows) sales[r.uid] = { count: Number(r.cnt) || 0, sum: Number(r.sum) || 0 };
    const certs: Record<string, number> = {};
    const certSrc: Record<string, Record<string, number>> = {};
    for (const r of certRows) {
      certs[r.uid] = (certs[r.uid] || 0) + (Number(r.cnt) || 0);
      (certSrc[r.uid] ||= {})[r.source] = (certSrc[r.uid][r.source] || 0) + (Number(r.cnt) || 0);
    }
    const expenses: Record<string, number> = {};
    for (const r of expRows) expenses[r.uid] = Number(r.sum) || 0;

    const agg: EmployeeAggregates = {
      sales, certs, certSrc,
      tasks: mapCnt(taskRows), orders: mapCnt(orderRows), actions: mapCnt(actionRows), expenses,
    };
    const employees = mergeEmployeeRows(users, agg);
    const dynamics = buildDynamics(
      salesDaily.map(r => ({ day: r.day, sum: Number(r.sum) || 0 })),
      certsDaily.map(r => ({ day: r.day, count: Number(r.cnt) || 0 })),
    );
    return { from, to, employees, dynamics };
  },

  async employeeActivity(userId?: string | null, fromRaw?: string | null, toRaw?: string | null) {
    if (!userId) throw badRequest('Нужен userId');
    const { from, to } = ensureRange(fromRaw, toRaw);
    return reportsRepo.employeeActivity(userId, from, to);
  },
};
