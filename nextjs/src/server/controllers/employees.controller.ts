import { NextRequest } from 'next/server';
import { withApi, created, optionsHandler, type RouteCtx } from '@/server/lib/http';
import { employeesService } from '@/server/services/employees.service';
import { FINANCE_WRITE_ROLES } from '@/server/lib/apiAccess';
import { forbidden } from '@/server/lib/errors';

export const OPTIONS = optionsHandler;

// Кадровые записи (оклад, выплаты) меняет только Админ/Бухгалтер; просмотр — по матрице.
function requireHr(ctx: RouteCtx) {
  if (!FINANCE_WRITE_ROLES.includes(ctx.user?.role || '')) {
    throw forbidden('Кадры и выплаты: только Админ или Бухгалтер');
  }
}

// collection: /api/v2/employees  (маскировка приватных зарплат по ctx.user)
export const GET = withApi(async (_req: NextRequest, ctx) => employeesService.list(ctx.user?.id));
export const POST = withApi(async (req: NextRequest, ctx) => {
  requireHr(ctx);
  return created(await employeesService.addEmployee(await req.json()));
});

// helpers: /api/v2/employees/candidates · /api/v2/employees/directory
export const CANDIDATES = withApi(async () => employeesService.candidates());
export const DIRECTORY = withApi(async () => employeesService.directory());

// item: /api/v2/employees/[id]  (id = userId)
export const PATCH = withApi(async (req: NextRequest, ctx) => {
  requireHr(ctx);
  return employeesService.updateSalary(ctx.params!.id, await req.json());
});
export const DELETE = withApi(async (_req: NextRequest, ctx) => {
  requireHr(ctx);
  return employeesService.removeEmployee(ctx.params!.id);
});

// payments: /api/v2/employees/[id]/payments  (ctx.params.id = userId)
export const LIST_PAYMENTS = withApi(async (_req: NextRequest, ctx) => employeesService.payments(ctx.params!.id, ctx.user?.id));
export const ADD_PAYMENT = withApi(async (req: NextRequest, ctx) => {
  requireHr(ctx);
  return created(await employeesService.recordPayment(ctx.params!.id, await req.json(), ctx.user ?? null));
});
