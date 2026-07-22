import { NextRequest } from 'next/server';
import { withApi, created, optionsHandler } from '@/server/lib/http';
import { financeService } from '@/server/services/finance.service';

export const OPTIONS = optionsHandler;

// GET /api/v2/finance?from=YYYY-MM-DD&to=YYYY-MM-DD — { accounts, operations }
export const GET = withApi(async (req: NextRequest) => {
  const sp = new URL(req.url).searchParams;
  return financeService.overview(sp.get('from'), sp.get('to'));
});
// POST /api/v2/finance — создать операцию (балансы обновляются), createdBy из сессии
export const POST = withApi(async (req: NextRequest, ctx) =>
  created(await financeService.createOperation(await req.json(), ctx.user?.id ?? null)));

// PATCH /api/v2/finance/[id] — правка МЕТАДАННЫХ операции (описание/поставщик/№док/
// статус/категория/дата/коммент) БЕЗ суммы/счёта — балансы не трогаются.
export const OP_PATCH = withApi(async (req: NextRequest, ctx) =>
  financeService.updateOperationMeta(ctx.params!.id, await req.json()));
// POST /api/v2/finance/[id]/reverse — отмена операции сторно (удаление расхода)
export const OP_REVERSE = withApi(async (_req: NextRequest, ctx) =>
  financeService.reverseOperation(ctx.params!.id, ctx.user?.id ?? null));

// POST /api/v2/finance/accounts — создать счёт (начальный остаток → операция)
export const ACCOUNTS_POST = withApi(async (req: NextRequest, ctx) =>
  created(await financeService.createAccount(await req.json(), ctx.user?.id ?? null)));
// PATCH /api/v2/finance/accounts/[id] — переименовать / поправить баланс / иконку
export const ACCOUNT_PATCH = withApi(async (req: NextRequest, ctx) =>
  financeService.updateAccount(ctx.params!.id, await req.json()));
