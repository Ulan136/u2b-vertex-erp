import { NextRequest } from 'next/server';
import { withApi, created, optionsHandler } from '@/server/lib/http';
import { salesService } from '@/server/services/sales.service';
import { forbidden } from '@/server/lib/errors';

export const OPTIONS = optionsHandler;

export const GET = withApi(async () => salesService.list());
export const POST = withApi(async (req: NextRequest, ctx) =>
  created(await salesService.create(await req.json(), ctx.user ? { id: ctx.user.id, name: ctx.user.name } : null)));

// POST /api/v2/sales/[id]/cancel — отмена продажи. Право: Админ и Бухгалтер.
const CANCEL_ROLES = ['admin', 'accountant'];
export const CANCEL = withApi(async (_req: NextRequest, ctx) => {
  if (!ctx.user || !CANCEL_ROLES.includes(ctx.user.role)) throw forbidden('Отменять продажи может только Админ или Бухгалтер');
  return salesService.cancel(ctx.params!.id, { id: ctx.user.id, name: ctx.user.name });
});
