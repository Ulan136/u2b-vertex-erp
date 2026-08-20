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

// Новый товар «на лету» из закупа (если SKU ещё нет в базе).
export const newProductSchema = z.object({
  skuCode: z.string().trim().min(1, 'Укажите артикул (SKU)').max(20),
  name: z.string().trim().min(1, 'Укажите название товара').max(200),
  minStock: z.coerce.number().int().nonnegative().optional(),
  price: z.union([z.string(), z.number()]).optional(),      // цена продажи (можно 0, задать позже)
  waterType: z.string().trim().nullish(),
});

// Строка оплаты закупа: счёт + сумма (как у расхода).
export const purchasePaymentSchema = z.object({
  accountId: z.string().uuid(),
  amount: z.coerce.number().positive(),
});

// Позиция закупа: existing productId, либо newProduct (создаётся при отсутствии SKU).
export const purchaseItemSchema = z.object({
  productId: z.string().uuid().nullish(),
  newProduct: newProductSchema.nullish(),
  qty: z.coerce.number().int().positive('Количество больше 0'),
  price: z.coerce.number().nonnegative().default(0),         // цена закупа за ед.
}).refine(d => !!d.productId || !!d.newProduct, { message: 'Выберите товар или заведите новый', path: ['productId'] });

// POST /purchases — закуп: приход одной или НЕСКОЛЬКИХ позиций (склад) + опц. оплата
// со счёта(ов). Все приходы делят purchase_group; оплата — общая на весь закуп.
export const purchaseCreateSchema = z.object({
  items: z.array(purchaseItemSchema).min(1, 'Добавьте хотя бы одну позицию'),
  supplier: z.string().trim().nullish(),
  docNo: z.string().trim().nullish(),
  moveDate: z.string().nullish(),
  comment: z.string().trim().nullish(),
  payments: z.array(purchasePaymentSchema).optional().default([]),
});

// PATCH /purchases/[id] — правка метаданных закупа (дата закупа/поставщик/№).
// Кол-во/цену/оплату здесь не трогаем (это склад+финансы — отдельные операции).
export const purchaseUpdateSchema = z.object({
  moveDate: z.string().nullish(),
  supplier: z.string().trim().nullish(),
  docNo: z.string().trim().nullish(),
});

// POST /purchases/[id]/pay — погашение долга: Расход со счёта(ов) на стоимость
// закупа. Дата оплаты (payDate) по умолчанию = сегодня (закуп мог быть раньше).
export const purchasePaySchema = z.object({
  payments: z.array(purchasePaymentSchema).min(1, 'Добавьте счёт оплаты'),
  payDate: z.string().nullish(),
});

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
