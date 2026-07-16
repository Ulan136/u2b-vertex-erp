import { ordersRepo } from '@/server/repositories/orders.repo';
import { usersRepo } from '@/server/repositories/users.repo';
import { notificationsService } from '@/server/services/notifications.service';
import {
  orderCreateSchema, orderUpdateSchema,
  nextOrderNoFor, filterOrdersBySource, externalCabinetUrl,
  type OrderSource,
} from '@/server/dto/orders.dto';
import { orderRecipients } from '@/server/dto/notifications.dto';
import { badRequest, notFound } from '@/server/lib/errors';

// Base cabinet URL: an explicit env override, else the serving origin (which is
// the canonical host — the legacy domain 308-redirects to it), else a safe default.
const fieldCabinetUrl = (origin?: string | null) =>
  process.env.EXTERNAL_CABINET_URL ||
  `${(origin || 'https://u2b-vertex-erp.vercel.app').replace(/\/+$/, '')}/cabinet`;

function asSource(v: string | null | undefined): OrderSource | null {
  return v === 'field_check' || v === 'tec' ? v : null;
}

export const ordersService = {
  // No source → all orders (back-compat); source → only that stream.
  async list(source?: string | null) {
    const rows = await ordersRepo.list();
    const s = asSource(source);
    return s ? filterOrdersBySource(rows, s) : rows;
  },

  async create(input: unknown) {
    const data = orderCreateSchema.parse(input);
    if (!data.orderNo) {
      const nos = (await ordersRepo.listNos()).map(r => r.no);
      data.orderNo = nextOrderNoFor(data.source, nos);
    }
    const order = await ordersRepo.create(data);
    // notify managers + admins about the new cabinet order (best-effort)
    try {
      const users = await usersRepo.listActiveLite();
      const isTec = order.source === 'tec';
      await notificationsService.create(orderRecipients(users), {
        type: 'order',
        title: `Новая заявка ${order.orderNo ?? ''} (${isTec ? 'ТЭЦ' : 'Выездная'})`,
        link: isTec ? 'tec-orders' : 'field-orders',
      });
    } catch { /* notifications are best-effort */ }
    return order;
  },

  async update(id: string, input: unknown) {
    if (!id) throw badRequest('id is required');
    const data = orderUpdateSchema.parse(input);
    const row = await ordersRepo.update(id, data);
    if (!row) throw notFound('Order not found');
    return row;
  },

  async remove(id: string) {
    if (!id) throw badRequest('id is required');
    await ordersRepo.remove(id);
    return { ok: true };
  },

  externalUrl: (source?: string | null, origin?: string | null) => ({
    url: externalCabinetUrl(fieldCabinetUrl(origin), asSource(source) ?? 'field_check'),
  }),
};
