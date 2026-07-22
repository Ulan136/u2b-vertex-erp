import { z } from 'zod';

// Позиция продажи (одна строка товара).
export const saleItemSchema = z.object({
  productId: z.string().min(1),
  productName: z.string().nullish(),
  skuCode: z.string().nullish(),
  qty: z.coerce.number().int().positive(),
  price: z.coerce.number().nonnegative(),
});
export type SaleItemInput = z.infer<typeof saleItemSchema>;

// Создание/правка продажи. items[] — мультипозиция; для обратной совместимости
// принимаются и одиночные поля (productId/qty/price) — синтезируются в 1 позицию.
export const saleMutateSchema = z.object({
  saleNo: z.string().nullish(),
  saleDate: z.string().nullish(),
  clientName: z.string().optional().default(''),
  clientType: z.enum(['retail', 'client']).optional().default('retail'),
  items: z.array(saleItemSchema).optional(),
  payStatus: z.string().optional(),
  invoiceType: z.string().optional(),
  accountId: z.string().nullish(),      // счёт для прихода при «Оплачено» (в sales не хранится)
  comment: z.string().nullish(),
  // legacy single-item shape
  productId: z.string().nullish(),
  productName: z.string().nullish(),
  skuCode: z.string().nullish(),
  qty: z.coerce.number().int().nullish(),
  price: z.union([z.string(), z.number()]).nullish(),
});
export type SaleMutate = z.infer<typeof saleMutateSchema>;
// alias для обратной совместимости с прежними импортами
export const saleCreateSchema = saleMutateSchema;
export type SaleCreate = SaleMutate;

export type SaleItem = { productId: string; productName: string | null; skuCode: string | null; qty: number; price: number; sum: number };

const money = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

// Нормализовать вход в массив позиций с посчитанной суммой. Если items не заданы,
// но есть одиночный товар — синтезируем одну позицию (back-compat).
type NormalizeInput = {
  items?: Array<{ productId: string; productName?: string | null; skuCode?: string | null; qty: number | string; price: number | string }> | null;
  productId?: string | null; productName?: string | null; skuCode?: string | null; qty?: number | string | null; price?: number | string | null;
};
export function normalizeItems(data: NormalizeInput): SaleItem[] {
  const raw = (data.items && data.items.length)
    ? data.items
    : (data.productId ? [{ productId: data.productId, productName: data.productName, skuCode: data.skuCode, qty: Number(data.qty) || 1, price: Number(data.price) || 0 }] : []);
  return raw.map(it => {
    const qty = Math.abs(Number(it.qty) || 0);
    const price = money(Number(it.price) || 0);
    return { productId: String(it.productId), productName: it.productName ?? null, skuCode: it.skuCode ?? null, qty, price, sum: money(qty * price) };
  }).filter(it => it.productId && it.qty > 0);
}

// Свод позиций в агрегаты строки sales (для списков/финансов).
export function aggregateItems(items: SaleItem[]) {
  const qty = items.reduce((s, it) => s + it.qty, 0);
  const total = money(items.reduce((s, it) => s + it.sum, 0));
  const single = items.length === 1 ? items[0] : null;
  const first = items[0];
  return {
    qty,
    total,
    productId: single ? single.productId : null,
    skuCode: single ? single.skuCode : null,
    price: single ? single.price : null,
    productName: single ? single.productName
      : (first ? `${first.productName || first.skuCode || 'товар'} +${items.length - 1} поз.` : null),
  };
}

// ── Учёт продажи (чистые функции — тестируемые) ──
// Приход в финансы создаётся ТОЛЬКО для оплаченной продажи.
export function financePostable(payStatus: string | null | undefined): boolean {
  return payStatus === 'Оплачено';
}
// Списания склада при проведении продажи (OUT по каждой позиции).
export function saleOutMovements(items: SaleItem[]): Array<{ productId: string; qty: number; moveType: 'OUT' }> {
  return items.map(it => ({ productId: it.productId, qty: it.qty, moveType: 'OUT' as const }));
}
// Возвраты склада при отмене/правке продажи (IN по каждой позиции).
export function saleReturnMovements(items: SaleItem[]): Array<{ productId: string; qty: number; moveType: 'IN' }> {
  return items.map(it => ({ productId: it.productId, qty: it.qty, moveType: 'IN' as const }));
}

// Следующий номер продажи ПРД-NNN (чистая функция, продолжает с максимального).
export function nextSaleNo(existing: Array<string | null | undefined>): string {
  const max = existing.reduce((m, s) => {
    const n = parseInt(String(s || '').replace(/\D/g, ''), 10) || 0;
    return Math.max(m, n);
  }, 0);
  return 'ПРД-' + String(max + 1).padStart(3, '0');
}
