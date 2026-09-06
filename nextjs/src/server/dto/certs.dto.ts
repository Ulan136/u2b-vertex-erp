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
  amount: z.union([z.string(), z.number()]).nullish(),   // цена поверки (позиции)
  note: z.string().nullish(),
  phone: z.string().nullish(),
  client: z.string().nullish(),
  sealType: z.string().nullish(),
  photos: z.array(z.string()).optional(),   // base64 data-URL[]; хранятся на сертификате
  orderId: z.string().nullish(),            // связь с заявкой (field_check order)
  result: z.string().optional(),
  docType: z.string().optional(),
  sentStatus: z.string().optional(),   // извещение: статус отправки
  operStatus: z.string().optional(),
  payStatus: z.string().optional(),
  invoiceType: z.string().optional(),
  isArchived: z.boolean().optional(),   // в архив / из архива
  // Реквизиты для е-КТРМ. ИИН/БИН — ровно 12 цифр, пустая строка допустима
  // (в разобранных сертификатах поле часто не заполнено).
  accuracyClass: z.string().nullish(),
  ownerKind: z.enum(['физлицо', 'юрлицо']).optional(),
  ownerTaxId: z.string().regex(/^(\d{12})?$/, 'ИИН/БИН — 12 цифр').nullish(),
  addressKz: z.string().nullish(),
  verifier: z.string().nullish(),
  // Оплата прямого сертификата/извещения (смешанная): строки {счёт, сумма}.
  // Пусто/не передано → приход на счёт раздела по умолчанию (при «Оплачено»).
  payments: z.array(z.object({ accountId: z.string().uuid(), amount: z.coerce.number().nonnegative() })).optional(),
});

// Раздел финансов, куда идёт доход прямого сертификата, по его источнику.
// Астана → «Филиал Астана» (branch); все поверочные → «Поверка» (poverka).
export function sectionForCertSource(source?: string | null): 'poverka' | 'branch' {
  return source === 'Астана' ? 'branch' : 'poverka';
}
// Доход по сертификату = фактически внесённая сумма (не Выездная — там доход
// через заявку мастера): «Оплачено» → вся цена (amount), «Есть остаток» →
// внесённая часть (paidAmount), иначе 0.
export function certIncomeAmount(cert: { source?: string | null; payStatus?: string | null; amount?: unknown; paidAmount?: unknown }): number {
  if (cert.source === 'Выездная') return 0;
  const v = cert.payStatus === 'Оплачено' ? Number(cert.amount)
    : cert.payStatus === 'Есть остаток' ? Number(cert.paidAmount)
    : 0;
  return Math.round((v || 0) * 100) / 100;
}
// Доход проводим, когда фактически внесено > 0.
export function certIncomePosts(cert: { source?: string | null; payStatus?: string | null; amount?: unknown; paidAmount?: unknown }): boolean {
  return certIncomeAmount(cert) > 0;
}

export const certUpdateSchema = certUpsertSchema.partial();

// Клеймо-расходник списывается только у ОПЛАЧЕННОЙ поверки. «В ожидании» —
// ещё не расход; когда статус станет «Оплачено», списание проведётся (и наоборот
// — при откате в «В ожидании» расходник возвращается).
export function isCertPaid(payStatus?: string | null): boolean {
  return payStatus === 'Оплачено';
}

export type CertQuery = { source?: string | null; archived?: boolean; type?: string | null; orderId?: string | null };

// Приём оплаты поверки (заявки): смешанная оплата — строки {счёт, сумма}.
export const poverkaPaymentSchema = z.object({
  payments: z.array(z.object({
    accountId: z.string().uuid(),
    amount: z.coerce.number().positive(),
  })).min(1, 'Добавьте хотя бы одну оплату'),
});

// Оплата по клиенту (Блок 1): цена за сертификат × кол-во ожидающих → приход
// (смешанная оплата на счета раздела) + опциональная выплата комиссии клиенту
// (простой Расход с выбранного счёта). Не для Выездной (там оплата через заявку).
export const payByClientSchema = z.object({
  source: z.string().min(1),
  docType: z.enum(['cert', 'izv']).optional(),
  client: z.string().min(1, 'Укажите клиента'),
  pricePerCert: z.coerce.number().positive('Укажите цену за сертификат'),
  count: z.coerce.number().int().positive().optional(),   // сколько сертификатов оплачиваем (из ожидающих); нет → все
  dateFrom: z.string().nullish(),   // диапазон дат поверки (checkDate): с
  dateTo: z.string().nullish(),     // диапазон дат поверки (checkDate): по
  payments: z.array(z.object({
    accountId: z.string().uuid(),
    amount: z.coerce.number().positive(),
  })).min(1, 'Добавьте хотя бы одну оплату'),
  commission: z.object({
    perCert: z.coerce.number().nonnegative(),
    accountId: z.string().uuid(),
  }).nullish(),
});

// Выплата комиссии клиенту (за сертификаты ТЭЦ): комиссия за сертификат × кол-во
// сертификатов без отметки о выплате в периоде. dateFrom/dateTo — для отметки
// задним числом (markCommissionPaid) — там perCert/accountId не нужны.
export const commissionPaySchema = z.object({
  dateFrom: z.string().nullish(),
  dateTo: z.string().nullish(),
  perCert: z.coerce.number().positive('Укажите комиссию за сертификат').optional(),
  accountId: z.string().uuid('Выберите счёт').optional(),
  count: z.coerce.number().int().positive().optional(),
});

// Подготовка полей к вставке/апдейту: undefined убираем (→ дефолт БД / без изменения),
// пустую строку в date/uuid-колонках приводим к null (иначе Postgres 500 на '').
const CERT_DATE_OR_UUID = new Set(['checkDate', 'nextCheckDate', 'branchId', 'orderId']);
export function cleanCertFields(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  Object.entries(data).forEach(([k, v]) => {
    if (v === undefined) return;
    out[k] = (v === '' && CERT_DATE_OR_UUID.has(k)) ? null : v;
  });
  return out;
}
