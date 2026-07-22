import { NextRequest } from 'next/server';
import { withApi, created, optionsHandler, type RouteCtx } from '@/server/lib/http';
import { deviceTypesService } from '@/server/services/deviceTypes.service';
import { forbidden } from '@/server/lib/errors';

export const OPTIONS = optionsHandler;

// Управление справочником — только Админ и Менеджер (см. ТЗ).
function requireManager(ctx: RouteCtx) {
  const role = ctx.user?.role;
  if (role !== 'admin' && role !== 'manager') throw forbidden('Справочник типов: доступ только Админу и Менеджеру');
}

// collection: /api/v2/device-types            → полный список (управление)
//             /api/v2/device-types?q=свк       → автоподсказка (≥1 символ), любой вошедший
export const GET = withApi(async (req: NextRequest) => {
  const q = new URL(req.url).searchParams.get('q');
  return q != null ? deviceTypesService.search(q) : deviceTypesService.list();
});

// create (Админ/Менеджер)
export const POST = withApi(async (req: NextRequest, ctx) => {
  requireManager(ctx);
  return created(await deviceTypesService.create(await req.json()));
});

// item: /api/v2/device-types/[id]
export const PATCH = withApi(async (req: NextRequest, ctx) => {
  requireManager(ctx);
  return deviceTypesService.rename(ctx.params!.id, await req.json());
});
export const DELETE = withApi(async (req: NextRequest, ctx) => {
  requireManager(ctx);
  return deviceTypesService.remove(ctx.params!.id);
});

// static: /api/v2/device-types/merge  { fromId, toId }
export const MERGE = withApi(async (req: NextRequest, ctx) => {
  requireManager(ctx);
  return deviceTypesService.merge(await req.json());
});
