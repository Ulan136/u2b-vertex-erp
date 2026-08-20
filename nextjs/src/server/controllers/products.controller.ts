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

// POST /api/v2/purchases — закуп: приход товара + опц. оплата со счёта(ов)
export const PURCHASE = withApi(async (req: NextRequest, ctx) =>
  created(await productsService.createPurchase(await req.json(), ctx.user ? { id: ctx.user.id, name: ctx.user.name } : null)));

// PATCH /api/v2/purchases/[id] — правка метаданных закупа (дата/поставщик/№)
export const PURCHASE_UPDATE = withApi(async (req: NextRequest, ctx) =>
  productsService.updatePurchase(ctx.params!.id, await req.json()));

// POST /api/v2/purchases/[id]/pay — погашение долга (Расход со счёта, дата = сегодня)
export const PURCHASE_PAY = withApi(async (req: NextRequest, ctx) =>
  productsService.payPurchaseDebt(ctx.params!.id, await req.json(), ctx.user ? { id: ctx.user.id, name: ctx.user.name } : null));

// POST /api/v2/products/movements/[id]/reverse — отмена движения (откат склада + сторно денег)
export const MOVEMENT_REVERSE = withApi(async (_req: NextRequest, ctx) =>
  productsService.reverseMovement(ctx.params!.id, { hard: false }, ctx.user ? { id: ctx.user.id, name: ctx.user.name } : null));

// DELETE /api/v2/products/movements/[id] — удаление движения (откат + сторно + удаление строки)
export const MOVEMENT_DELETE = withApi(async (_req: NextRequest, ctx) =>
  productsService.reverseMovement(ctx.params!.id, { hard: true }, ctx.user ? { id: ctx.user.id, name: ctx.user.name } : null));
