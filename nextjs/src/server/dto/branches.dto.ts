import { z } from 'zod';

// Типы счёта/оплаты филиала — совпадают с invoice_type enum в схеме.
export const INVOICE_TYPES = ['Каспи', 'БЦК', 'Наличка'] as const;

export const branchCreateSchema = z.object({
  name: z.string().trim().min(1, 'Название обязательно'),
  city: z.string().trim().optional(),
  address: z.string().trim().optional(),
  invoiceType: z.enum(INVOICE_TYPES).optional().default('Каспи'),
  isHead: z.boolean().optional().default(false),
});

export const branchUpdateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  city: z.string().trim().nullish(),
  address: z.string().trim().nullish(),
  invoiceType: z.enum(INVOICE_TYPES).optional(),
  isHead: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export type BranchCreate = z.infer<typeof branchCreateSchema>;
