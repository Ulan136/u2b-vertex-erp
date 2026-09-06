import { NextRequest } from 'next/server';
import { withApi, created, optionsHandler } from '@/server/lib/http';
import { certsService } from '@/server/services/certs.service';

export const OPTIONS = optionsHandler;

// collection: /api/v2/certs
export const GET = withApi(async (req: NextRequest, ctx) => {
  const sp = new URL(req.url).searchParams;
  return certsService.list({
    source: sp.get('source'),
    archived: sp.get('archived') === 'true',
    type: sp.get('type'),
    orderId: sp.get('orderId'),
  }, ctx.user ? { id: ctx.user.id, role: ctx.user.role } : null);
});
export const POST = withApi(async (req: NextRequest, ctx) => created(await certsService.create(await req.json(), ctx.user ? { id: ctx.user.id, name: ctx.user.name } : null)));

// pay-account: /api/v2/certs/[id]/pay-account (GET — текущий счёт оплаты; POST — сменить)
export const PAY_INFO = withApi(async (_req: NextRequest, ctx) => certsService.payInfo(ctx.params!.id));
export const PAY_ACCOUNT = withApi(async (req: NextRequest, ctx) => certsService.changePayAccount(ctx.params!.id, await req.json(), ctx.user ? { id: ctx.user.id, name: ctx.user.name } : null));

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

// POST /api/v2/certs/commission — выплата комиссии клиенту (сертификаты ТЭЦ) за период.
export const payCommission = withApi(async (req: NextRequest, ctx) =>
  certsService.payCommission(await req.json(), ctx.user ? { id: ctx.user.id, name: ctx.user.name } : null));
// POST /api/v2/certs/commission/mark — отметить комиссию выплаченной задним числом.
export const markCommission = withApi(async (req: NextRequest) =>
  certsService.markCommissionPaid(await req.json()));
