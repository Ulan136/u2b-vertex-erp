import { z } from 'zod';

// PATCH /products/[id] — карточка товара (наименование, мин.остаток, цены, тип воды, группа).
export const productUpdateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  fullName: z.string().nullish(),
  minStock: z.coerce.number().int().nonnegative().optional(),
  price: z.union([z.string(), z.number()]).optional(),
  priceDiscount: z.union([z.string(), z.number()]).optional(),
  costPrice: z.union([z.string(), z.number()]).optional(),
  waterType: z.string().nullish(),
  groupId: z.string().nullish(),
});

// ── Учёт остатка (чистые функции — тестируемые) ──
// Знак движения: приход/ревизия+ увеличивают, расход/ревизия− уменьшают остаток.
export const STOCK_SIGN: Record<string, number> = { 'IN': 1, 'REV+': 1, 'OUT': -1, 'REV-': -1 };
// Остаток после движения (qty берётся по модулю).
export function stockAfter(current: number, moveType: string, qty: number): number {
  return (Number(current) || 0) + (STOCK_SIGN[moveType] ?? 0) * Math.abs(Number(qty) || 0);
}
// Можно ли провести движение, не уводя остаток ниже нуля (запрет овердрафта).
export function canApplyStock(current: number, moveType: string, qty: number): boolean {
  return stockAfter(current, moveType, qty) >= 0;
}

// Клеймо-расходник, который списывается при создании ПОВЕРКИ (docType='cert'):
// СЛ → «Самоклеющийся лейбл (СЛ)», ПЛ → «Пластиковое пломбо (ПЛ)». Извещение
// (docType='izv') клеймо не тратит. Дефолт — СЛ (как радио в форме поверки).
export function sealMarker(docType?: string | null, sealType?: string | null): 'СЛ' | 'ПЛ' | null {
  if ((docType || 'cert') !== 'cert') return null;
  return sealType === 'ПЛ' ? 'ПЛ' : 'СЛ';
}

// POST /products records a stock movement (приход/расход), not a product.
export const stockMovementSchema = z.object({
  productId: z.string(),
  skuCode: z.string().nullish(),
  productName: z.string().nullish(),
  moveType: z.string(),
  qty: z.coerce.number().int(),
  price: z.union([z.string(), z.number()]).nullish(),
  totalSum: z.union([z.string(), z.number()]).nullish(),
  certId: z.string().nullish(),
  docNo: z.string().nullish(),
  supplier: z.string().nullish(),
  comment: z.string().nullish(),
  author: z.string().nullish(),
  moveDate: z.string().nullish(),
});
