import { NextRequest } from 'next/server';
import { withApi, created, optionsHandler } from '@/server/lib/http';
import { usersService } from '@/server/services/users.service';

export const OPTIONS = optionsHandler;

// collection: /api/v2/users        → active users (assignee pickers)
//             /api/v2/users?all=1  → full management list (incl. inactive)
export const GET = withApi(async (req: NextRequest) => {
  const all = new URL(req.url).searchParams.get('all');
  return usersService.list(all === '1' || all === 'true');
});
export const POST = withApi(async (req: NextRequest) => created(await usersService.create(await req.json())));

// item: /api/v2/users/[id] — edit / role change / (de)activate
export const PATCH = withApi(async (req: NextRequest, ctx) => usersService.update(ctx.params!.id, await req.json()));
