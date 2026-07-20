import { z } from 'zod';

export const saleCreateSchema = z.object({
  saleNo: z.string().nullish(),
  saleDate: z.string().nullish(),
  clientName: z.string().optional().default(''),
  productId: z.string().nullish(),
  productName: z.string().nullish(),
  skuCode: z.string().nullish(),
  qty: z.coerce.number().int().nullish(),
  price: z.union([z.string(), z.number()]).nullish(),
  totalSum: z.union([z.string(), z.number()]).nullish(),
  payStatus: z.string().optional(),
  invoiceType: z.string().optional(),
  accountId: z.string().nullish(),   // счёт для прихода в финансы при «Оплачено» (в sales не хранится)
  comment: z.string().nullish(),
});

export type SaleCreate = z.infer<typeof saleCreateSchema>;

// Следующий номер продажи ПРД-NNN (чистая функция, продолжает с максимального).
export function nextSaleNo(existing: Array<string | null | undefined>): string {
  const max = existing.reduce((m, s) => {
    const n = parseInt(String(s || '').replace(/\D/g, ''), 10) || 0;
    return Math.max(m, n);
  }, 0);
  return 'ПРД-' + String(max + 1).padStart(3, '0');
}
