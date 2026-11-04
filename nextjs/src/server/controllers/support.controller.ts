import { NextRequest } from 'next/server';
import { withApi, created, optionsHandler } from '@/server/lib/http';
import { supportService } from '@/server/services/support.service';
import { usersRepo } from '@/server/repositories/users.repo';
import { BRANCH_ROLE } from '@/server/dto/permissions.dto';

export const OPTIONS = optionsHandler;

// Филиал видит только свои заявки — скоуп считаем на сервере, а не доверяем клиенту.
async function scopeBranch(role?: string | null, userId?: string | null): Promise<string | null> {
  if (role !== BRANCH_ROLE || !userId) return null;
  return (await usersRepo.branchOf(userId)) ?? null;
}

// collection: /api/v2/support?status=open|Новая|…&q=…
export const GET = withApi(async (req: NextRequest, ctx) => {
  const sp = new URL(req.url).searchParams;
  const forced = await scopeBranch(ctx.user?.role, ctx.user?.id);
  return supportService.list({
    status: sp.get('status'),
    q: sp.get('q'),
    branchId: forced ?? sp.get('branchId'),
  });
});

export const POST = withApi(async (req: NextRequest, ctx) =>
  created(await supportService.create(await req.json(), ctx.user?.id ?? null)));

// item: /api/v2/support/[id] — карточка с перепиской
export const GET_ITEM = withApi(async (_req: NextRequest, ctx) =>
  supportService.get(ctx.params!.id, await scopeBranch(ctx.user?.role, ctx.user?.id)));

export const PATCH = withApi(async (req: NextRequest, ctx) =>
  supportService.update(ctx.params!.id, await req.json()));

// reply: /api/v2/support/[id]/reply — сообщение в переписку
export const POST_REPLY = withApi(async (req: NextRequest, ctx) =>
  created(await supportService.reply(ctx.params!.id, await req.json(), ctx.user?.id ?? null)));
