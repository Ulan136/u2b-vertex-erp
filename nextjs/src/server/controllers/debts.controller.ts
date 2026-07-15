import { NextRequest } from 'next/server';
import { withApi, created, optionsHandler } from '@/server/lib/http';
import { debtsService } from '@/server/services/debts.service';

export const OPTIONS = optionsHandler;

// collection: /api/v2/debts?type=&status=&accountId=&q=
export const GET = withApi(async (req: NextRequest) => {
  const sp = new URL(req.url).searchParams;
  return debtsService.list({
    type: sp.get('type'),
    status: sp.get('status'),
    accountId: sp.get('accountId'),
    q: sp.get('q'),
  });
});
export const POST = withApi(async (req: NextRequest) => created(await debtsService.create(await req.json())));

// item: /api/v2/debts/[id]
export const PATCH = withApi(async (req: NextRequest, ctx) => debtsService.update(ctx.params!.id, await req.json()));
export const DELETE = withApi(async (req: NextRequest, ctx) => debtsService.remove(ctx.params!.id));

// payments collection: /api/v2/debts/[id]/payments  (ctx.params.id = debtId)
export const LIST_PAYMENTS = withApi(async (req: NextRequest, ctx) => debtsService.listPayments(ctx.params!.id));
export const ADD_PAYMENT = withApi(async (req: NextRequest, ctx) => created(await debtsService.addPayment(ctx.params!.id, await req.json())));

// payment item: /api/v2/debt-payments/[id]  (ctx.params.id = paymentId)
export const REMOVE_PAYMENT = withApi(async (req: NextRequest, ctx) => debtsService.removePayment(ctx.params!.id));
