import { NextRequest } from 'next/server';
import { withApi, created, optionsHandler } from '@/server/lib/http';
import { tasksService } from '@/server/services/tasks.service';

export const OPTIONS = optionsHandler;

// collection: /api/v2/tasks?assigneeId=..&q=..
export const GET = withApi(async (req: NextRequest) => {
  const sp = new URL(req.url).searchParams;
  return tasksService.list({
    assigneeId: sp.get('assigneeId'),
    q: sp.get('q'),
  });
});
export const POST = withApi(async (req: NextRequest) => created(await tasksService.create(await req.json())));

// item: /api/v2/tasks/[id]  (PATCH handles field edits and status change)
export const PATCH = withApi(async (req: NextRequest, ctx) => tasksService.update(ctx.params!.id, await req.json()));
export const DELETE = withApi(async (req: NextRequest, ctx) => tasksService.remove(ctx.params!.id));
