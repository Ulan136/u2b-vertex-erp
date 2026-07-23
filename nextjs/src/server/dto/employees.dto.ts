import { z } from 'zod';

// ── Schemas ───────────────────────────────────────────────────
export const employeeAddSchema = z.object({
  userId: z.string().uuid(),
  fixedSalary: z.coerce.number().nonnegative().default(0),
});

export const salaryUpdateSchema = z.object({
  fixedSalary: z.coerce.number().nonnegative(),
});

export const salaryPaymentSchema = z.object({
  amount: z.coerce.number().positive('Сумма должна быть больше 0'),
  accountId: z.string().uuid('Выберите счёт списания').optional(),
  // Смешанная оплата: выплата с нескольких счетов (Σ = amount). Одна запись
  // выплаты в кадрах, но несколько расход-операций в финансах (общая группа).
  payments: z.array(z.object({ accountId: z.string().uuid(), amount: z.coerce.number().positive() })).optional(),
  payDate: z.string().nullish(),
  kind: z.enum(['salary', 'advance']).default('salary'),
  comment: z.string().nullish(),
  // явное подтверждение переплаты («деньги следующего месяца»)
  confirmOverpay: z.boolean().optional().default(false),
});

export type SalaryPaymentInput = z.infer<typeof salaryPaymentSchema>;

// ── Salary privacy ────────────────────────────────────────────
// Зарплата и выплаты Директора и Админа видны ТОЛЬКО им самим. Всем остальным
// (включая бухгалтера) суммы скрыты — enforce на сервере, не только в UI.
export const SALARY_PRIVATE_ROLES = ['director', 'admin'];

export function canSeeSalary(
  viewerId: string | null | undefined,
  empUserId: string,
  empRole: string | null | undefined,
): boolean {
  if (viewerId && empUserId && viewerId === empUserId) return true; // сам себя видит всегда
  return !SALARY_PRIVATE_ROLES.includes(empRole || '');
}

// ── Month helpers (строки 'YYYY-MM', без таймзон) ─────────────
export function monthKey(d: string | Date | null | undefined): string {
  if (!d) return '';
  const s = typeof d === 'string' ? d : d.toISOString();
  return s.slice(0, 7);
}

export function nextMonth(m: string): string {
  const [y, mo] = m.split('-').map(Number);
  const nm = mo + 1;
  return nm > 12 ? `${y + 1}-01` : `${y}-${String(nm).padStart(2, '0')}`;
}

// ── Расчёт статуса зарплаты за месяц (с переносом аванса) ─────
// Излишек выплат сверх оклада переносится в следующий месяц: «Выплачено»
// следующего месяца стартует с этой суммы (аванс). paidThisMonth = перенесённый
// аванс + фактические выплаты текущего месяца.
export interface SalaryStatus {
  salary: number;
  paidThisMonth: number;  // перенос из прошлых месяцев + выплаты этого месяца
  remaining: number;      // сколько ещё должны в этом месяце
  advanceIn: number;      // аванс, перенесённый в текущий месяц из прошлых
  advanceOut: number;     // излишек текущего месяца → аванс следующего
}

export function computeSalaryStatus(
  payments: Array<{ payDate?: string | Date | null; amount: string | number }>,
  fixedSalary: string | number,
  currentMonth: string,
): SalaryStatus {
  const salary = Number(fixedSalary) || 0;

  // суммы выплат по месяцам
  const byMonth: Record<string, number> = {};
  for (const p of payments) {
    const m = monthKey(p.payDate) || currentMonth;
    byMonth[m] = (byMonth[m] || 0) + (Number(p.amount) || 0);
  }

  const months = Object.keys(byMonth).sort();
  const first = months.length ? months[0] : currentMonth;

  // накапливаем аванс с первого месяца выплат до текущего (исключительно)
  let credit = 0;
  let m = first;
  let guard = 0;
  while (m < currentMonth && guard++ < 600) {
    credit = Math.max(0, credit + (byMonth[m] || 0) - salary);
    m = nextMonth(m);
  }

  const paidThisMonth = credit + (byMonth[currentMonth] || 0);
  const remaining = Math.max(0, salary - paidThisMonth);
  const advanceOut = Math.max(0, paidThisMonth - salary);
  return { salary, paidThisMonth, remaining, advanceIn: credit, advanceOut };
}

// ── Контроль переплаты для формы выплаты ─────────────────────
// Возвращает излишек (превышение оклада) после добавления суммы.
export function overpayInfo(
  paidThisMonth: number | string,
  fixedSalary: number | string,
  addAmount: number | string,
): { after: number; excess: number; exceeds: boolean; alreadyPaidFull: boolean } {
  const salary = Number(fixedSalary) || 0;
  const paid = Number(paidThisMonth) || 0;
  const add = Number(addAmount) || 0;
  const after = paid + add;
  const excess = salary > 0 ? Math.max(0, after - salary) : 0;
  return {
    after,
    excess,
    exceeds: salary > 0 && excess > 0,
    alreadyPaidFull: salary > 0 && paid >= salary,
  };
}

// ── Финансовая операция «Расход» для выплаты ─────────────────
// Каждая выплата = реальный Расход в финансах, видимый отдельной строкой.
export function buildSalaryFinanceOp(
  emp: { name?: string | null },
  data: { accountId: string; amount: number | string; payDate?: string | null; kind?: string; comment?: string | null },
): { opDate?: string; name: string; accountId: string; opType: string; amount: number; source: string; comment?: string } {
  const isAdvance = data.kind === 'advance';
  const who = emp.name || 'сотрудник';
  const spec: { opDate?: string; name: string; accountId: string; opType: string; amount: number; source: string; comment?: string } = {
    name: `Зарплата: ${who}${isAdvance ? ' (аванс)' : ''}`,
    accountId: data.accountId,
    opType: 'Расход',
    amount: Number(data.amount) || 0,
    source: 'Зарплата',
  };
  if (data.payDate) spec.opDate = data.payDate;
  if (data.comment) spec.comment = data.comment;
  return spec;
}
