import { NextRequest } from 'next/server';
import { withApi, created, optionsHandler } from '@/server/lib/http';
import { usersService } from '@/server/services/users.service';
import { forbidden } from '@/server/lib/errors';

export const OPTIONS = optionsHandler;

// collection: /api/v2/users        → active users (assignee pickers)
//             /api/v2/users?all=1  → full management list (incl. inactive)
export const GET = withApi(async (req: NextRequest) => {
  const all = new URL(req.url).searchParams.get('all');
  return usersService.list(all === '1' || all === 'true');
});
export const POST = withApi(async (req: NextRequest) => created(await usersService.create(await req.json())));

// item: /api/v2/users/[id] — edit / role change / (de)activate.
// actingUserId comes from the SESSION (not the client) for the self-guard.
export const PATCH = withApi(async (req: NextRequest, ctx) =>
  usersService.update(ctx.params!.id, await req.json(), ctx.user?.id ?? null));

// POST /api/v2/users/[id]/password — сброс пароля (экран «Управление паролями»).
// Жёстко только для админа (даже если роли выдан экран «Настройки»).
export const setPassword = withApi(async (req: NextRequest, ctx) => {
  if (ctx.user?.role !== 'admin') throw forbidden('Управление паролями доступно только администратору');
  return usersService.setPassword(ctx.params!.id, await req.json());
});
