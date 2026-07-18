import { z } from 'zod';

export const financeOperationSchema = z.object({
  opDate: z.string().nullish(),
  name: z.string(),
  accountId: z.string(),
  accountName: z.string().nullish(),
  opType: z.string(),
  amount: z.union([z.string(), z.number()]),
  toAccountId: z.string().nullish(),   // только для «Перевод» — счёт-получатель (в БД не хранится, нужен для балансов)
  source: z.string().nullish(),
  certId: z.string().nullish(),
  saleId: z.string().nullish(),
  comment: z.string().nullish(),
});

export const ACCOUNT_CATEGORIES = ['kaspi', 'bck', 'nalichka', 'other'] as const;
export const FINANCE_SECTIONS = ['poverka', 'sale', 'other', 'branch'] as const;
export type FinanceSection = (typeof FINANCE_SECTIONS)[number];

export const accountCreateSchema = z.object({
  name: z.string().trim().min(1, 'Название обязательно'),
  category: z.enum(ACCOUNT_CATEGORIES).optional().default('other'),   // банк
  section: z.enum(FINANCE_SECTIONS).optional().default('other'),      // раздел
  icon: z.string().nullish(),
  balance: z.union([z.string(), z.number()]).optional().default(0),   // начальный остаток → операция «Начальный остаток»
});

export const accountUpdateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  section: z.enum(FINANCE_SECTIONS).optional(),
  icon: z.string().nullish(),
});

// ── Влияние операции на балансы счетов (pure, unit-testable) ──
// Приход +сумма; Расход −сумма; Перевод: −со счёта-источника, +на счёт-получатель.
export function balanceDeltas(
  opType: string,
  amount: string | number,
  accountId: string,
  toAccountId?: string | null,
): Array<{ id: string; delta: number }> {
  const amt = Number(amount) || 0;
  if (opType === 'Приход') return [{ id: accountId, delta: amt }];
  if (opType === 'Расход') return [{ id: accountId, delta: -amt }];
  if (opType === 'Перевод') {
    const out = [{ id: accountId, delta: -amt }];
    if (toAccountId) out.push({ id: toAccountId, delta: amt });
    return out;
  }
  return [];
}

// ── Скоуп экрана «Финансы» по разделу и периоду (pure, unit-testable) ──
type AcctLite = { id: string; balance?: string | number | null; section?: string | null };
type OpLite = { accountId: string; opType: string; amount?: string | number | null; opDate?: string | null };

// Знаковая сумма движения: Приход +, Расход/Перевод −.
export function movementAmount(opType: string, amount: string | number): number {
  const amt = Number(amount) || 0;
  return opType === 'Приход' ? amt : -amt;
}

export function inPeriod(opDate: string | null | undefined, from?: string | null, to?: string | null): boolean {
  const d = String(opDate || '').slice(0, 10);
  return (!from || d >= from) && (!to || d <= to);
}

// Скоуп: раздел ('all' | poverka/sale/other/branch) + период [from,to].
// Возвращает видимые счета, движения и сводку (касса, приходы, расходы).
export function scopeFinance<A extends AcctLite, O extends OpLite>(
  accounts: A[],
  ops: O[],
  opts: { section?: string | null; from?: string | null; to?: string | null },
) {
  const secOf: Record<string, string> = {};
  accounts.forEach(a => { secOf[a.id] = a.section || 'other'; });
  const cats = (opts.section && opts.section !== 'all')
    ? [opts.section]
    : [...FINANCE_SECTIONS];
  const visAccts = accounts.filter(a => cats.includes(a.section || 'other'));
  const movs = ops.filter(o => cats.includes(secOf[o.accountId]) && inPeriod(o.opDate, opts.from, opts.to));
  const total = visAccts.reduce((s, a) => s + (Number(a.balance) || 0), 0);
  const income = movs.filter(o => o.opType === 'Приход').reduce((s, o) => s + (Number(o.amount) || 0), 0);
  const expense = movs.filter(o => o.opType !== 'Приход').reduce((s, o) => s + (Number(o.amount) || 0), 0);
  return { cats, visAccts, movs, total, income, expense };
}
