import { NextRequest } from 'next/server';
import { withApi, created, optionsHandler } from '@/server/lib/http';
import { employeesService } from '@/server/services/employees.service';

export const OPTIONS = optionsHandler;

// Кадры и выплаты гейтятся экраном «Сотрудники» из матрицы (в withApi через
// apiScreenFor → 'staff'). Отдельного хардкода Админ/Бухгалтер больше нет —
// кто имеет доступ к «Сотрудникам», тот и ведёт кадры/зарплату. Маскировка
// приватных зарплат в списке остаётся (по ctx.user).

// collection: /api/v2/employees  (маскировка приватных зарплат по ctx.user)
export const GET = withApi(async (_req: NextRequest, ctx) => employeesService.list(ctx.user ?? null));
export const POST = withApi(async (req: NextRequest) => created(await employeesService.addEmployee(await req.json())));

// helpers: /api/v2/employees/candidates · /api/v2/employees/directory
export const CANDIDATES = withApi(async () => employeesService.candidates());
export const DIRECTORY = withApi(async () => employeesService.directory());

// item: /api/v2/employees/[id]  (id = userId)
export const PATCH = withApi(async (req: NextRequest, ctx) => employeesService.updateSalary(ctx.params!.id, await req.json()));
export const DELETE = withApi(async (_req: NextRequest, ctx) => employeesService.removeEmployee(ctx.params!.id));

// payments: /api/v2/employees/[id]/payments  (ctx.params.id = userId)
export const LIST_PAYMENTS = withApi(async (_req: NextRequest, ctx) => employeesService.payments(ctx.params!.id, ctx.user ?? null));
export const ADD_PAYMENT = withApi(async (req: NextRequest, ctx) => created(await employeesService.recordPayment(ctx.params!.id, await req.json(), ctx.user ?? null)));
