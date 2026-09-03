import { NextRequest } from 'next/server';
import { withApi, created, optionsHandler } from '@/server/lib/http';
import { branchService } from '@/server/services/branch.service';

export const OPTIONS = optionsHandler;

// GET /api/v2/branch/finance?from=&to=&branch= — счета и движения филиала
// (branch — только для admin, чтобы смотреть конкретный филиал; роль branch
// всегда видит свой, параметр игнорируется).
export const FINANCE = withApi(async (req: NextRequest, ctx) => {
  const sp = new URL(req.url).searchParams;
  return branchService.finance({ id: ctx.user!.id, role: ctx.user!.role }, sp.get('from'), sp.get('to'), sp.get('branch'));
});

// POST /api/v2/branch/expense?branch= — расход со счёта филиала
export const EXPENSE = withApi(async (req: NextRequest, ctx) => created(await branchService.createExpense({ id: ctx.user!.id, role: ctx.user!.role }, await req.json(), ctx.user?.id ?? null, new URL(req.url).searchParams.get('branch'))));

// POST /api/v2/branch/transfer?branch= — перевод со счёта филиала (свои/головной)
export const TRANSFER = withApi(async (req: NextRequest, ctx) => created(await branchService.createTransfer({ id: ctx.user!.id, role: ctx.user!.role }, await req.json(), ctx.user?.id ?? null, new URL(req.url).searchParams.get('branch'))));
