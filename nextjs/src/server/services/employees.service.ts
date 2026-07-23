import { randomUUID } from 'crypto';
import { db } from '@/db';
import { employeesRepo } from '@/server/repositories/employees.repo';
import { financeService } from '@/server/services/finance.service';
import {
  employeeAddSchema, salaryUpdateSchema, salaryPaymentSchema,
  computeSalaryStatus, canSeeSalary, overpayInfo, buildSalaryFinanceOp, monthKey,
} from '@/server/dto/employees.dto';
import { badRequest, notFound, forbidden, conflict } from '@/server/lib/errors';

const money = (n: number) => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);
const thisMonth = () => monthKey(new Date().toISOString());

// Скрыть суммы, если смотрящий не имеет права видеть зарплату сотрудника.
function maskEmployee<T extends { userId: string; role?: string | null }>(
  emp: T & { fixedSalary?: unknown; paidThisMonth?: unknown; remaining?: unknown; advanceIn?: unknown },
  viewerId: string | null | undefined,
) {
  const canSee = canSeeSalary(viewerId, emp.userId, emp.role);
  if (canSee) return { ...emp, salaryHidden: false };
  return {
    ...emp,
    fixedSalary: null,
    paidThisMonth: null,
    remaining: null,
    advanceIn: null,
    salaryHidden: true,   // UI покажет «•••», сумм в ответе НЕТ
  };
}

export const employeesService = {
  // Список сотрудников с расчётом статуса за текущий месяц + маскировка приватных.
  async list(viewerId: string | null | undefined) {
    const month = thisMonth();
    const [rows, payments] = await Promise.all([
      employeesRepo.listEmployees(),
      employeesRepo.allPayments(),
    ]);
    const byUser: Record<string, Array<{ payDate: string | null; amount: string }>> = {};
    for (const p of payments) {
      (byUser[p.userId] ||= []).push({ payDate: p.payDate ?? null, amount: String(p.amount) });
    }
    const employees = rows.map((r) => {
      const st = computeSalaryStatus(byUser[r.userId] || [], r.fixedSalary ?? 0, month);
      return maskEmployee({
        userId: r.userId,
        name: r.name,
        position: r.position,
        role: r.role,
        branchId: r.branchId,
        branchName: r.branchName,
        email: r.email,
        isActive: r.isActive,
        fixedSalary: Number(r.fixedSalary) || 0,
        paidThisMonth: st.paidThisMonth,
        remaining: st.remaining,
        advanceIn: st.advanceIn,
      }, viewerId);
    });
    return { month, employees };
  },

  // Экран «Руководитель» — директория (реальные пользователи, без зарплат).
  directory: () => employeesRepo.directory(),

  // Кандидаты для добавления (активные пользователи без оклада).
  candidates: () => employeesRepo.candidates(),

  async addEmployee(input: unknown) {
    const data = employeeAddSchema.parse(input);
    const user = await employeesRepo.findUser(data.userId);
    if (!user) throw notFound('Пользователь не найден');
    const existing = await employeesRepo.findSalary(data.userId);
    if (existing) throw conflict('Сотрудник уже добавлен');
    return employeesRepo.upsertSalary(data.userId, money(data.fixedSalary));
  },

  async updateSalary(userId: string, input: unknown) {
    const data = salaryUpdateSchema.parse(input);
    const row = await employeesRepo.updateSalary(userId, money(data.fixedSalary));
    if (!row) throw notFound('Сотрудник не найден');
    return row;
  },

  async removeEmployee(userId: string) {
    await employeesRepo.removeSalary(userId);   // история выплат/финопераций сохраняется
    return { ok: true };
  },

  // Выплаты сотрудника (с проверкой приватности).
  async payments(userId: string, viewerId: string | null | undefined) {
    const user = await employeesRepo.findUser(userId);
    if (!user) throw notFound('Сотрудник не найден');
    if (!canSeeSalary(viewerId, userId, user.role)) throw forbidden('Зарплата скрыта');
    return employeesRepo.paymentsFor(userId);
  },

  // Зарегистрировать выплату → реальный Расход в финансах + запись в кадрах.
  async recordPayment(userId: string, input: unknown, actor?: { id: string } | null) {
    const data = salaryPaymentSchema.parse(input);
    const user = await employeesRepo.findUser(userId);
    if (!user) throw notFound('Сотрудник не найден');

    // Приватность: выплаты Директору/Админу может проводить только он сам.
    if (!canSeeSalary(actor?.id, userId, user.role)) throw forbidden('Нет доступа к зарплате сотрудника');

    const salary = await employeesRepo.findSalary(userId);
    if (!salary) throw badRequest('У сотрудника не задан оклад');

    // Контроль переплаты — сервер тоже требует подтверждения.
    const month = thisMonth();
    const payments = await employeesRepo.paymentsFor(userId);
    const st = computeSalaryStatus(payments.map((p) => ({ payDate: p.payDate, amount: p.amount })), salary.fixedSalary ?? 0, month);
    const over = overpayInfo(st.paidThisMonth, salary.fixedSalary ?? 0, data.amount);
    if (over.exceeds && !data.confirmOverpay) {
      throw conflict(`Оклад за месяц уже выплачен. Превышение ${over.excess.toLocaleString('ru-RU')} ₸ — это деньги следующего месяца. Подтвердите переплату.`);
    }

    // Строки выплаты: смешанная оплата (payments[]) или один счёт (accountId).
    const rows = (data.payments && data.payments.length)
      ? data.payments.map((p) => ({ accountId: p.accountId, amount: Number(p.amount) || 0 }))
      : (data.accountId ? [{ accountId: data.accountId, amount: Number(data.amount) || 0 }] : []);
    if (!rows.length) throw badRequest('Выберите счёт списания');

    // Расходы в финансах (по каждому счёту, общая группа) + ОДНА запись выплаты
    // в кадрах (Σ = amount) — всё в одной транзакции.
    const groupId = randomUUID();
    const { payment } = await db.transaction(async (tx) => {
      let firstOpId: string | null = null;
      for (const r of rows) {
        const opSpec = buildSalaryFinanceOp(user, { ...data, accountId: r.accountId, amount: r.amount });
        const op = await financeService.createOperation({
          opDate: opSpec.opDate, name: opSpec.name, accountId: opSpec.accountId, opType: opSpec.opType,
          amount: money(opSpec.amount), source: opSpec.source, comment: opSpec.comment, expenseGroupId: groupId,
        }, actor?.id ?? null, tx);
        if (!firstOpId) firstOpId = op?.id ?? null;
      }
      const payment = await employeesRepo.createPayment({
        userId,
        amount: money(data.amount),
        accountId: rows[0].accountId,
        financeOpId: firstOpId,
        payDate: data.payDate ?? undefined,
        kind: data.kind,
        comment: data.comment ?? null,
        createdBy: actor?.id ?? null,
      }, tx);
      return { payment };
    });

    // Пересчёт статуса после выплаты.
    const after = computeSalaryStatus(
      [...payments.map((p) => ({ payDate: p.payDate, amount: p.amount })), { payDate: payment.payDate, amount: payment.amount }],
      salary.fixedSalary ?? 0, month,
    );
    return { payment, status: after };
  },
};
