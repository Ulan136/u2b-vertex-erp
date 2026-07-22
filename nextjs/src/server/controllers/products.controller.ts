import { NextRequest } from 'next/server';
import { withApi, created, optionsHandler } from '@/server/lib/http';
import { productsService } from '@/server/services/products.service';

export const OPTIONS = optionsHandler;

// GET /api/v2/products — активный каталог с остатками
export const GET = withApi(async () => productsService.list());
// POST /api/v2/products — провести движение склада (приход/расход/ревизия) + сдвиг остатка
export const POST = withApi(async (req: NextRequest, ctx) =>
  created(await productsService.createMovement(await req.json(), ctx.user ? { id: ctx.user.id, name: ctx.user.name } : null)));

// PATCH /api/v2/products/[id] — карточка товара (наименование/мин/цены/тип воды)
export const PATCH = withApi(async (req: NextRequest, ctx) => productsService.update(ctx.params!.id, await req.json()));

// GET /api/v2/products/movements?limit=&type=IN|OUT|REV+|REV-&from=&to= — журнал движений
export const MOVEMENTS = withApi(async (req: NextRequest) => {
  const sp = new URL(req.url).searchParams;
  return productsService.movements(Number(sp.get('limit')) || 60, sp.get('type'), sp.get('from'), sp.get('to'));
});

// GET /api/v2/products/movements/summary?from=&to= — сводка Приход/Расход по SKU (read-only)
export const MOVEMENTS_SUMMARY = withApi(async (req: NextRequest) => {
  const sp = new URL(req.url).searchParams;
  return productsService.movementsSummary(sp.get('from'), sp.get('to'));
});
