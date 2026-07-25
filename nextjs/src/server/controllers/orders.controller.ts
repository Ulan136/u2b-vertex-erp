import { NextRequest } from 'next/server';
import { withApi, created, optionsHandler } from '@/server/lib/http';
import { ordersService } from '@/server/services/orders.service';
import { rateLimit, clientIp } from '@/server/lib/rateLimit';
import { tooManyRequests } from '@/server/lib/errors';

export const OPTIONS = optionsHandler;

// collection: /api/v2/orders?source=field_check|tec&branch=<id|all>  (no source → all)
// Заявки скоупятся по филиалу вызывающего (Админ/Директор — все или ?branch=…).
export const GET = withApi(async (req: NextRequest, ctx) => {
  const sp = new URL(req.url).searchParams;
  return ordersService.list(sp.get('source'), ctx.user, sp.get('branch'));
});
export const POST = withApi(async (req: NextRequest, ctx) => {
  // Публичный кабинет (без сессии) — троттлим приём заявок: 20/мин на IP.
  if (!ctx.user && !rateLimit(`order:${clientIp(req.headers)}`, 20, 60_000).ok) {
    throw tooManyRequests('Слишком много заявок, попробуйте через минуту');
  }
  return created(await ordersService.create(await req.json(), ctx.user));
});

// item: /api/v2/orders/[id]
export const PATCH = withApi(async (req: NextRequest, ctx) => ordersService.update(ctx.params!.id, await req.json(), ctx.user));
export const DELETE = withApi(async (req: NextRequest, ctx) => ordersService.remove(ctx.params!.id));

// POST /api/v2/orders/[id]/seen — логист открыл изменённую заявку (снять отметку).
export const SEEN = withApi(async (req: NextRequest, ctx) => ordersService.markEditedSeen(ctx.params!.id));

// GET /api/v2/orders/[id]/cabinet?token= — заявка для клиентского кабинета (по токену).
export const CABINET_GET = withApi(async (req: NextRequest, ctx) =>
  ordersService.cabinetGet(ctx.params!.id, new URL(req.url).searchParams.get('token')));
// PATCH /api/v2/orders/[id]/cabinet — правка заявки из кабинета (токен в теле).
export const CABINET_PATCH = withApi(async (req: NextRequest, ctx) => {
  const body = await req.json().catch(() => ({}));
  const token = (body as { token?: string }).token ?? new URL(req.url).searchParams.get('token');
  return ordersService.cabinetUpdate(ctx.params!.id, token, body);
});

// static: /api/v2/orders/external-url?source=field_check|tec
export const EXTERNAL_URL = withApi(async (req: NextRequest) => {
  const url = new URL(req.url);
  return ordersService.externalUrl(url.searchParams.get('source'), url.origin);
});
