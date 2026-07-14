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
  comment: z.string().nullish(),
});

export type SaleCreate = z.infer<typeof saleCreateSchema>;
