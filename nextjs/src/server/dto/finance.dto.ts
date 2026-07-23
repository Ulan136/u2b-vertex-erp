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
  // Поля расхода (модалка «Расход»).
  expenseCat: z.string().nullish(),
  subCategory: z.string().nullish(),
  supplier: z.string().nullish(),
  docNo: z.string().nullish(),
  status: z.string().nullish(),
  orderId: z.string().uuid().nullish(),
  expenseGroupId: z.string().uuid().nullish(),
});

// Строка смешанной оплаты расхода: счёт + сумма.
export const expensePaymentSchema = z.object({
  accountId: z.string().uuid(),
  amount: z.coerce.number().positive(),
});
// Расход с нескольких счетов: общие поля + строки оплат.
export const expenseCreateSchema = z.object({
  name: z.string().optional(),
  opDate: z.string().nullish(),
  comment: z.string().nullish(),
  expenseCat: z.string().nullish(),
  subCategory: z.string().nullish(),
  supplier: z.string().nullish(),
  docNo: z.string().nullish(),
  status: z.string().nullish(),
  orderId: z.string().uuid().nullish(),
  payments: z.array(expensePaymentSchema).min(1, 'Добавьте счёт и сумму'),
});

// ── Учёт расхода (чистые функции — тестируемые) ──
const rmoney = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
export function expensePaymentsTotal(payments: Array<{ amount: number | string }>): number {
  return rmoney(payments.reduce((s, p) => s + (Number(p.amount) || 0), 0));
}
// Полностью ли распределена сумма расхода по счетам (Σ строк == Итого).
export function expenseFullyAllocated(total: number | string, payments: Array<{ amount: number | string }>): boolean {
  return Math.abs(expensePaymentsTotal(payments) - rmoney(Number(total) || 0)) < 0.005;
}
export function expenseRemaining(total: number | string, payments: Array<{ amount: number | string }>): number {
  return rmoney((Number(total) || 0) - expensePaymentsTotal(payments));
}

// Правка МЕТАДАННЫХ операции (без суммы/счёта/типа — балансы не трогаем).
export const financeOpMetaSchema = z.object({
  name: z.string().optional(),
  opDate: z.string().nullish(),
  comment: z.string().nullish(),
  expenseCat: z.string().nullish(),
  subCategory: z.string().nullish(),
  supplier: z.string().nullish(),
  docNo: z.string().nullish(),
  status: z.string().nullish(),
  orderId: z.string().uuid().nullish(),
});

export const ACCOUNT_CATEGORIES = ['kaspi', 'bck', 'nalichka', 'other'] as const;

// Единый источник порядка/номеров/названий/цветов разделов финансов («категорий»).
// Порядок = нумерация: №1 Поверка · №2 Продажа · №3 Филиалы · №4 Прочие операции.
// ВНИМАНИЕ: при изменении держать в синхроне с зеркалом в public/finance-view.js
// и public/sketch_screens.html (FIN_SECTIONS).
export const FINANCE_SECTION_META = [
  { key: 'poverka', no: 1, label: 'Поверка',         icon: '📋', color: '#2563eb' },
  { key: 'sale',    no: 2, label: 'Продажа',         icon: '💰', color: '#d97706' },
  { key: 'branch',  no: 3, label: 'Филиалы',         icon: '🏢', color: '#0d9488' },
  { key: 'other',   no: 4, label: 'Прочие операции', icon: '📄', color: '#6f42c1' },
] as const;

export const FINANCE_SECTIONS = FINANCE_SECTION_META.map(s => s.key) as unknown as readonly ['poverka', 'sale', 'branch', 'other'];
export type FinanceSection = (typeof FINANCE_SECTIONS)[number];

export function sectionMeta(key: string | null | undefined) {
  return FINANCE_SECTION_META.find(s => s.key === key) || FINANCE_SECTION_META[3];
}
export function sectionNo(key: string | null | undefined): number { return sectionMeta(key).no; }
// «№1 Поверка» (withNo=false → «Поверка»)
export function sectionTitle(key: string | null | undefined, withNo = true): string {
  const m = sectionMeta(key);
  return (withNo ? `№${m.no} ` : '') + m.label;
}

// Нумерация счетов ВНУТРИ раздела по sort_order (name — как tiebreaker).
// Возвращает { accountId: номер (1..n) } — нумерация отдельная в каждом разделе.
export function numberAccounts<A extends { id: string; section?: string | null; sortOrder?: number | null; name?: string | null }>(
  accounts: A[],
): Record<string, number> {
  const bySec: Record<string, A[]> = {};
  for (const a of accounts) (bySec[a.section || 'other'] ||= []).push(a);
  const out: Record<string, number> = {};
  for (const key of Object.keys(bySec)) {
    bySec[key].sort((x, y) =>
      (Number(x.sortOrder ?? 0) - Number(y.sortOrder ?? 0)) ||
      String(x.name || '').localeCompare(String(y.name || '')));
    bySec[key].forEach((a, i) => { out[a.id] = i + 1; });
  }
  return out;
}

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

// Тип операции определяет приход/расход. СТОРНО (reverses) и ОТМЕНЁННЫЕ
// (reversedAt) в суммы приходов/расходов НЕ входят: сторно возврата дохода —
// это НЕ расход, а обнуление дохода. Категория/раздел счёта роли не играет.
type OpLike = { opType?: string | null; reverses?: string | null; reversedAt?: unknown };
export function isLiveOp(op: OpLike): boolean {
  return !op.reverses && !op.reversedAt;
}
export function isRealIncome(op: OpLike): boolean {
  return op.opType === 'Приход' && isLiveOp(op);
}
export function isRealExpense(op: OpLike): boolean {
  return op.opType === 'Расход' && isLiveOp(op);
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
  // Внимание: здесь «expense» = отток из раздела (Расход + Перевод), это иная
  // семантика, чем «Расходы» в виджетах (там только op_type='Расход', см. isRealExpense).
  const income = movs.filter(o => o.opType === 'Приход').reduce((s, o) => s + (Number(o.amount) || 0), 0);
  const expense = movs.filter(o => o.opType !== 'Приход').reduce((s, o) => s + (Number(o.amount) || 0), 0);
  return { cats, visAccts, movs, total, income, expense };
}
