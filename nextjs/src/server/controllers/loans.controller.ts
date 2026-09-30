import { NextRequest } from 'next/server';
import { withApi, created, optionsHandler } from '@/server/lib/http';
import { loansService } from '@/server/services/loans.service';

export const OPTIONS = optionsHandler;

// GET /api/v2/loans — список долгов; POST — выдать долг.
export const GET = withApi(async () => loansService.list());
export const POST = withApi(async (req: NextRequest, ctx) => created(await loansService.give(await req.json(), ctx.user ? { id: ctx.user.id } : null)));

// POST /api/v2/loans/[id]/return — принять возврат.
export const RETURN = withApi(async (req: NextRequest, ctx) => loansService.returnLoan(ctx.params!.id, await req.json(), ctx.user ? { id: ctx.user.id } : null));
