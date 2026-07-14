import { z } from 'zod';

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
