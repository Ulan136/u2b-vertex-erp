import { NextRequest } from 'next/server';
import { withApi, created, optionsHandler } from '@/server/lib/http';
import { branchService } from '@/server/services/branch.service';

export const OPTIONS = optionsHandler;

// GET /api/v2/branch/finance?from=&to= — счета и движения ТОЛЬКО своего филиала
export const FINANCE = withApi(async (req: NextRequest, ctx) => {
  const sp = new URL(req.url).searchParams;
  return branchService.finance({ id: ctx.user!.id, role: ctx.user!.role }, sp.get('from'), sp.get('to'));
});

// POST /api/v2/branch/expense — расход со своего счёта
export const EXPENSE = withApi(async (req: NextRequest, ctx) => created(await branchService.createExpense({ id: ctx.user!.id, role: ctx.user!.role }, await req.json(), ctx.user?.id ?? null)));

// POST /api/v2/branch/transfer — перевод со своего счёта (свои/головной)
export const TRANSFER = withApi(async (req: NextRequest, ctx) => created(await branchService.createTransfer({ id: ctx.user!.id, role: ctx.user!.role }, await req.json(), ctx.user?.id ?? null)));
