import { NextRequest } from 'next/server';
import { withApi, optionsHandler } from '@/server/lib/http';
import { branchService } from '@/server/services/branch.service';

export const OPTIONS = optionsHandler;

// GET /api/v2/branch/finance?from=&to= — счета и движения ТОЛЬКО своего филиала
export const FINANCE = withApi(async (req: NextRequest, ctx) => {
  const sp = new URL(req.url).searchParams;
  return branchService.finance({ id: ctx.user!.id, role: ctx.user!.role }, sp.get('from'), sp.get('to'));
});
