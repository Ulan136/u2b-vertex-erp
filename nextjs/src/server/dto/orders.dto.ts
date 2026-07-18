import { z } from 'zod';

// Origin channel of an order. Each source is an independent stream with its
// own external cabinet URL and its own order-number sequence.
export const ORDER_SOURCES = ['field_check', 'tec'] as const;
export type OrderSource = (typeof ORDER_SOURCES)[number];

// Human-facing order-number prefix per source (ЗАК-001, ТЭЦ-001, …).
export const ORDER_NO_PREFIX: Record<OrderSource, string> = {
  field_check: 'ЗАК-',
  tec: 'ТЭЦ-',
};

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
  // фотоотчёт мастера — массив data-URL строк (сжатые изображения). Необязательно
  // и без .default([]), чтобы PATCH без photos не затирал уже загруженные фото.
  photos: z.array(z.string()).optional(),
  // филиал заявки (nullable). Обычно проставляется сервером (создатель/кабинет).
  branchId: z.string().uuid().nullish(),
  comment: z.string().nullish(),
  status: z.string().optional().default('В работе'),
  // determined by which external cabinet the order came from; defaults keep the
  // old cabinet (Выездная поверка) working unchanged.
  source: z.enum(ORDER_SOURCES).optional().default('field_check'),
});

export const orderUpdateSchema = orderCreateSchema.partial();

export type OrderCreate = z.infer<typeof orderCreateSchema>;
export type OrderUpdate = z.infer<typeof orderUpdateSchema>;

// ── Pure helpers (no DB) — unit-testable ──────────────────────

// Next order number for a source: prefix + (max existing number of the SAME
// source + 1). Numbers of other sources are ignored, so ЗАК-*** and ТЭЦ-***
// advance independently.
export function nextOrderNoFor(source: OrderSource, existingNos: Array<string | null | undefined>): string {
  const prefix = ORDER_NO_PREFIX[source] ?? ORDER_NO_PREFIX.field_check;
  const max = existingNos.reduce((m, no) => {
    if (!no || !no.startsWith(prefix)) return m;   // only same-source numbers count
    const n = parseInt(no.slice(prefix.length).replace(/\D/g, ''), 10);
    return isNaN(n) ? m : Math.max(m, n);
  }, 0);
  return prefix + String(max + 1).padStart(3, '0');
}

// Keep only orders of the given source. Rows without a source are treated as
// 'field_check' (the pre-migration default) so nothing silently disappears.
export function filterOrdersBySource<T extends { source?: string | null }>(rows: T[], source: OrderSource): T[] {
  return rows.filter(r => (r.source ?? 'field_check') === source);
}

// External cabinet URL for a source. `base` is the field_check cabinet URL;
// tec lives one path segment deeper (…/cabinet → …/cabinet/tec).
export function externalCabinetUrl(base: string, source: OrderSource): string {
  const b = base.replace(/\/+$/, '');
  return source === 'tec' ? `${b}/tec` : b;
}

// ── Разделение заявок по филиалу (pure, unit-testable) ────────────
// Заявка без филиала (branchId === null) считается заявкой ГОЛОВНОГО филиала
// (headBranchId) — так старые заявки остаются у Алматы.
export function orderInBranch(
  order: { branchId?: string | null },
  branchId: string,
  headBranchId: string | null,
): boolean {
  return (order.branchId ?? headBranchId) === branchId;
}

// Что видит пользователь на экране заявок / в кабинете мастера:
//   - Админ и Директор — все филиалы (или выбранный branchFilter);
//   - остальные — только свой филиал (userBranchId);
//   - если филиал у пользователя не задан — видит всё (правило кабинета мастера).
export function scopeOrdersByBranch<T extends { branchId?: string | null }>(
  rows: T[],
  opts: { role?: string | null; userBranchId?: string | null; headBranchId: string | null; branchFilter?: string | null },
): T[] {
  const seesAll = opts.role === 'admin' || opts.role === 'director';
  if (seesAll) {
    if (opts.branchFilter && opts.branchFilter !== 'all') {
      return rows.filter(o => orderInBranch(o, opts.branchFilter as string, opts.headBranchId));
    }
    return rows;
  }
  if (!opts.userBranchId) return rows;                       // филиал не задан → всё
  return rows.filter(o => orderInBranch(o, opts.userBranchId as string, opts.headBranchId));
}
