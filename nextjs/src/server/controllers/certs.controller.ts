import { NextRequest } from 'next/server';
import { withApi, created, optionsHandler } from '@/server/lib/http';
import { certsService } from '@/server/services/certs.service';

export const OPTIONS = optionsHandler;

// collection: /api/v2/certs
export const GET = withApi(async (req: NextRequest) => {
  const sp = new URL(req.url).searchParams;
  return certsService.list({
    source: sp.get('source'),
    archived: sp.get('archived') === 'true',
    type: sp.get('type'),
    orderId: sp.get('orderId'),
  });
});
export const POST = withApi(async (req: NextRequest, ctx) => created(await certsService.create(await req.json(), ctx.user ? { id: ctx.user.id, name: ctx.user.name } : null)));

// item: /api/v2/certs/[id]
export const PATCH = withApi(async (req: NextRequest, ctx) => certsService.update(ctx.params!.id, await req.json(), ctx.user ? { id: ctx.user.id, name: ctx.user.name } : null));
export const DELETE = withApi(async (req: NextRequest, ctx) => certsService.remove(ctx.params!.id, ctx.user ? { id: ctx.user.id, name: ctx.user.name } : null));

// POST /api/v2/orders/[id]/payment — приём оплаты заявки (выездной мастер):
// смешанная оплата → приход на счета «Поверка» + сертификаты «Оплачено».
export const payOrder = withApi(async (req: NextRequest, ctx) =>
  certsService.payOrder(ctx.params!.id, await req.json(), ctx.user ? { id: ctx.user.id, name: ctx.user.name } : null));

// POST /api/v2/certs/pay-by-client — оплата по клиенту (Блок 1, не Выездная):
// ожидающие сертификаты клиента → «Оплачено» по цене×кол-во + приход на счета +
// опциональная выплата комиссии клиенту (Расход).
export const payByClient = withApi(async (req: NextRequest, ctx) =>
  certsService.payByClient(await req.json(), ctx.user ? { id: ctx.user.id, name: ctx.user.name } : null));
