import { z } from 'zod';

export type DebtType = 'debit' | 'credit';
export type DebtStatus = 'open' | 'partial' | 'closed';

// ── Pure helpers (no DB) — unit-testable ──────────────────────

// Status is derived from paid vs amount:
//   paid = 0            → open
//   0 < paid < amount   → partial
//   paid >= amount      → closed
export function computeStatus(amount: number, paid: number): DebtStatus {
  if (paid <= 0) return 'open';
  if (paid >= amount) return 'closed';
  return 'partial';
}

export function remainingOf(amount: number, paid: number): number {
  return Math.max(0, round2(amount - paid));
}

// Round to 2 decimals to keep money arithmetic exact-ish.
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Payment against a debit debt = money coming in (Приход);
// payment against a credit debt = money going out (Расход).
export function financeOpTypeForDebt(type: DebtType): 'Приход' | 'Расход' {
  return type === 'debit' ? 'Приход' : 'Расход';
}

export type PaymentFinanceOp = {
  opType: 'Приход' | 'Расход';
  accountId: string;
  amount: number;
  name: string;
  source: string;
  opDate: string | null;
  comment: string | null;
};

// Build the finance-ledger operation a payment must create. Returns null when
// no account is available (finance_accounts empty / no account chosen) — the
// payment is still recorded, just without a ledger entry.
export function buildPaymentFinanceOp(
  debt: { type: DebtType; accountId?: string | null },
  payment: { amount: number; accountId?: string | null; payDate?: string | null; comment?: string | null },
  counterpartyLabel: string,
): PaymentFinanceOp | null {
  const accountId = payment.accountId ?? debt.accountId ?? null;
  if (!accountId) return null;
  return {
    opType: financeOpTypeForDebt(debt.type),
    accountId,
    amount: payment.amount,
    name: `Погашение долга — ${counterpartyLabel}`,
    source: 'Долг',
    opDate: payment.payDate ?? null,
    comment: payment.comment ?? null,
  };
}

// ── Zod schemas ───────────────────────────────────────────────
const debtBase = z.object({
  type: z.enum(['debit', 'credit']),
  counterpartyClientId: z.string().uuid().nullish(),
  counterpartyName: z.string().trim().min(1).nullish(),
  amount: z.coerce.number().positive('Сумма должна быть больше 0'),
  accountId: z.string().uuid().nullish(),
  dueDate: z.string().nullish(),
  comment: z.string().nullish(),
});

// create: exactly one counterparty source is required
export const debtCreateSchema = debtBase.refine(
  d => Boolean(d.counterpartyClientId) || Boolean(d.counterpartyName && d.counterpartyName.trim()),
  { message: 'Укажите клиента или название контрагента', path: ['counterpartyName'] },
);

export const debtUpdateSchema = debtBase.partial();

export const debtPaymentSchema = z.object({
  amount: z.coerce.number().positive('Сумма погашения должна быть больше 0'),
  accountId: z.string().uuid().nullish(),
  payDate: z.string().nullish(),
  comment: z.string().nullish(),
});

export type DebtCreate    = z.infer<typeof debtCreateSchema>;
export type DebtUpdate    = z.infer<typeof debtUpdateSchema>;
export type DebtPaymentIn = z.infer<typeof debtPaymentSchema>;
