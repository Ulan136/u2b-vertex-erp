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
export const PATCH = withApi(async (req: NextRequest, ctx) => ordersService.update(ctx.params!.id, await req.json()));
export const DELETE = withApi(async (req: NextRequest, ctx) => ordersService.remove(ctx.params!.id));

// static: /api/v2/orders/external-url?source=field_check|tec
export const EXTERNAL_URL = withApi(async (req: NextRequest) => {
  const url = new URL(req.url);
  return ordersService.externalUrl(url.searchParams.get('source'), url.origin);
});
