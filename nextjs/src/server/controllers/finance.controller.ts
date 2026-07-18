import { NextRequest } from 'next/server';
import { withApi, created, optionsHandler } from '@/server/lib/http';
import { financeService } from '@/server/services/finance.service';

export const OPTIONS = optionsHandler;

// GET /api/v2/finance — { accounts, operations }
export const GET = withApi(async () => financeService.overview());
// POST /api/v2/finance — создать операцию (балансы обновляются), createdBy из сессии
export const POST = withApi(async (req: NextRequest, ctx) =>
  created(await financeService.createOperation(await req.json(), ctx.user?.id ?? null)));

// POST /api/v2/finance/accounts — создать счёт
export const ACCOUNTS_POST = withApi(async (req: NextRequest) =>
  created(await financeService.createAccount(await req.json())));
// PATCH /api/v2/finance/accounts/[id] — переименовать / поправить баланс / иконку
export const ACCOUNT_PATCH = withApi(async (req: NextRequest, ctx) =>
  financeService.updateAccount(ctx.params!.id, await req.json()));
