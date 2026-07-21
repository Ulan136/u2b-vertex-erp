import { z } from 'zod';

// Certificate + извещение share the table (docType). Every field is optional so
// both a full cert POST and a reduced izv POST validate; unknown keys are stripped.
export const certUpsertSchema = z.object({
  source: z.string().optional(),
  branchId: z.string().nullish(),
  fio: z.string().optional(),
  address: z.string().optional(),
  meterType: z.string().nullish(),
  serialNo: z.string().nullish(),
  yearMade: z.coerce.number().int().nullish(),
  waterType: z.string().optional(),
  seal: z.boolean().optional(),
  checkDate: z.string().nullish(),
  nextCheckDate: z.string().nullish(),
  stampNo: z.string().nullish(),
  readings: z.union([z.string(), z.number()]).nullish(),
  note: z.string().nullish(),
  phone: z.string().nullish(),
  sealType: z.string().nullish(),
  result: z.string().optional(),
  docType: z.string().optional(),
  operStatus: z.string().optional(),
  payStatus: z.string().optional(),
  invoiceType: z.string().optional(),
});

export const certUpdateSchema = certUpsertSchema.partial();

export type CertQuery = { source?: string | null; archived?: boolean; type?: string | null };

// Подготовка полей к вставке/апдейту: undefined убираем (→ дефолт БД / без изменения),
// пустую строку в date/uuid-колонках приводим к null (иначе Postgres 500 на '').
const CERT_DATE_OR_UUID = new Set(['checkDate', 'nextCheckDate', 'branchId']);
export function cleanCertFields(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  Object.entries(data).forEach(([k, v]) => {
    if (v === undefined) return;
    out[k] = (v === '' && CERT_DATE_OR_UUID.has(k)) ? null : v;
  });
  return out;
}
