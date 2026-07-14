import { ordersRepo } from '@/server/repositories/orders.repo';
import { orderCreateSchema, orderUpdateSchema } from '@/server/dto/orders.dto';
import { badRequest, notFound } from '@/server/lib/errors';

// Auto-assign ЗАК-NNN (max existing + 1) when the client didn't provide one.
async function nextOrderNo(): Promise<string> {
  const rows = await ordersRepo.listNos();
  const max = rows.reduce((m, r) => {
    const n = parseInt((r.no ?? '').replace(/\D/g, ''), 10);
    return isNaN(n) ? m : Math.max(m, n);
  }, 0);
  return 'ЗАК-' + String(max + 1).padStart(3, '0');
}

export const ordersService = {
  list: () => ordersRepo.list(),

  async create(input: unknown) {
    const data = orderCreateSchema.parse(input);
    if (!data.orderNo) data.orderNo = await nextOrderNo();
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

  externalUrl: () => ({
    url: process.env.EXTERNAL_CABINET_URL || 'https://u2b-api.vercel.app/cabinet',
  }),
};
