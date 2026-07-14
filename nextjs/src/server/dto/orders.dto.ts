import { z } from 'zod';

export const positionSchema = z.object({
  address: z.string(),
  qty: z.coerce.number().int().positive().default(1),
  water: z.string(),
});

export const orderCreateSchema = z.object({
  orderNo: z.string().nullish(),
  orderDate: z.string().nullish(),
  clientName: z.string().nullish(),
  address: z.string().nullish(),
  phone: z.string().nullish(),
  qty: z.coerce.number().int().nullish(),
  waterType: z.string().nullish(),
  positions: z.array(positionSchema).optional().default([]),
  comment: z.string().nullish(),
  status: z.string().optional().default('В работе'),
});

export const orderUpdateSchema = orderCreateSchema.partial();

export type OrderCreate = z.infer<typeof orderCreateSchema>;
export type OrderUpdate = z.infer<typeof orderUpdateSchema>;
