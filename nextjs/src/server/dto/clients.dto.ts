import { z } from 'zod';
import { badRequest } from '@/server/lib/errors';

// ── Phone normalization ───────────────────────────────────────
// Normalize a Kazakhstan phone to the canonical +7XXXXXXXXXX form
// (country code 7 + 10 digits). Accepts common inputs:
//   "+7 700 000 00 00", "8 (700) 000-00-00", "7000000000" → +77000000000
// Returns null for empty/nullish input; throws 400 for anything that can't
// be a valid 10-digit KZ number. Kept pure (no DB) for unit testing.
export function normalizePhone(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return null;

  let local: string;
  if (digits.length === 10) {
    local = digits;                       // bare 10-digit number
  } else if (digits.length === 11 && (digits[0] === '7' || digits[0] === '8')) {
    local = digits.slice(1);              // leading 7/8 country/trunk prefix
  } else {
    throw badRequest(`Некорректный телефон: «${raw}»`);
  }
  return '+7' + local;
}

// ── Category ↔ branch guard ───────────────────────────────────
// A client's category must belong to the same branch as the client.
// `category` is the looked-up category row (or null when none/unknown).
// Kept pure (no DB) so it can be unit tested directly.
export function assertCategoryInBranch(
  category: { id: string; branchId: string } | null | undefined,
  branchId: string,
  categoryId: string | null | undefined,
): void {
  if (categoryId == null) return;                     // "без категории" is always allowed
  if (!category) throw badRequest('Категория не найдена');
  if (category.branchId !== branchId) {
    throw badRequest('Категория принадлежит другому филиалу');
  }
}

// ── Zod schemas ───────────────────────────────────────────────
export const clientCreateSchema = z.object({
  branchId: z.string().uuid('branchId должен быть UUID филиала'),
  name: z.string().trim().min(1, 'Имя обязательно'),
  phone: z.string().nullish(),
  categoryId: z.string().uuid().nullish(),
});

// branchId is fixed after creation — clients never move between branches.
export const clientUpdateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  phone: z.string().nullish(),
  categoryId: z.string().uuid().nullish(),
});

export const categoryCreateSchema = z.object({
  branchId: z.string().uuid('branchId должен быть UUID филиала'),
  name: z.string().trim().min(1, 'Название обязательно'),
});

export const categoryUpdateSchema = z.object({
  name: z.string().trim().min(1),
});

export type ClientCreate   = z.infer<typeof clientCreateSchema>;
export type ClientUpdate   = z.infer<typeof clientUpdateSchema>;
export type CategoryCreate = z.infer<typeof categoryCreateSchema>;
export type CategoryUpdate = z.infer<typeof categoryUpdateSchema>;
