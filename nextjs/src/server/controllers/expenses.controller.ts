import { NextRequest } from 'next/server';
import { withApi, created, optionsHandler } from '@/server/lib/http';
import { financeService } from '@/server/services/finance.service';

export const OPTIONS = optionsHandler;

// Расходы вынесены из /api/v2/finance (тот только Админ/Бухгалтер) на свой путь —
// гейтятся экраном «Расходы» из матрицы, поэтому любая роль с доступом к «Расходам»
// может их вносить/править/отменять. Реальные операции проводит financeService.
// POST /api/v2/expenses — внести расход (createExpense: payments[] → операции группой).
export const POST = withApi(async (req: NextRequest, ctx) => created(await financeService.createExpense(await req.json(), ctx.user?.id ?? null)));
// PATCH /api/v2/expenses/[id] — правка метаданных расхода (без суммы/счёта).
export const PATCH = withApi(async (req: NextRequest, ctx) => financeService.updateOperationMeta(ctx.params!.id, await req.json()));
// POST /api/v2/expenses/[id]/reverse — отмена расхода (сторно всей группы).
export const REVERSE = withApi(async (_req: NextRequest, ctx) => financeService.reverseExpense(ctx.params!.id, ctx.user?.id ?? null));
// POST /api/v2/expenses/[id]/account — сменить счёт списания (сторно + новая операция).
export const CHANGE_ACCOUNT = withApi(async (req: NextRequest, ctx) =>
  financeService.changeExpenseAccount(ctx.params!.id, (await req.json())?.accountId, ctx.user?.id ?? null));
