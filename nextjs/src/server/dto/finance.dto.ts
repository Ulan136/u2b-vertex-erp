import { z } from 'zod';

export const financeOperationSchema = z.object({
  opDate: z.string().nullish(),
  name: z.string(),
  accountId: z.string(),
  accountName: z.string().nullish(),
  opType: z.string(),
  amount: z.union([z.string(), z.number()]),
  source: z.string().nullish(),
  certId: z.string().nullish(),
  saleId: z.string().nullish(),
  comment: z.string().nullish(),
});
