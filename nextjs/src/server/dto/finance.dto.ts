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

export const accountCreateSchema = z.object({
  name: z.string().trim().min(1, 'Название обязательно'),
  category: z.enum(ACCOUNT_CATEGORIES).optional().default('other'),
  icon: z.string().nullish(),
  balance: z.union([z.string(), z.number()]).optional().default(0),
});

export const accountUpdateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  icon: z.string().nullish(),
  balance: z.union([z.string(), z.number()]).optional(),
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
