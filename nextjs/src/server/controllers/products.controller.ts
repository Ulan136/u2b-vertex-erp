import { NextRequest } from 'next/server';
import { withApi, created, optionsHandler } from '@/server/lib/http';
import { productsService } from '@/server/services/products.service';

export const OPTIONS = optionsHandler;

// GET /api/v2/products — активный каталог с остатками
export const GET = withApi(async () => productsService.list());
// POST /api/v2/products — провести движение склада (приход/расход/ревизия) + сдвиг остатка
export const POST = withApi(async (req: NextRequest, ctx) =>
  created(await productsService.createMovement(await req.json(), ctx.user ? { id: ctx.user.id, name: ctx.user.name } : null)));

// GET /api/v2/products/movements — журнал движений
export const MOVEMENTS = withApi(async (req: NextRequest) => {
  const lim = Number(new URL(req.url).searchParams.get('limit')) || 60;
  return productsService.movements(lim);
});
