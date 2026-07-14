import { ordersRepo } from '@/server/repositories/orders.repo';
import {
  orderCreateSchema, orderUpdateSchema,
  nextOrderNoFor, filterOrdersBySource, externalCabinetUrl,
  type OrderSource,
} from '@/server/dto/orders.dto';
import { badRequest, notFound } from '@/server/lib/errors';

const FIELD_CABINET_URL = () => process.env.EXTERNAL_CABINET_URL || 'https://u2b-api.vercel.app/cabinet';

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
    return ordersRepo.create(data);
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

  externalUrl: (source?: string | null) => ({
    url: externalCabinetUrl(FIELD_CABINET_URL(), asSource(source) ?? 'field_check'),
  }),
};
