import { NextRequest } from 'next/server';
import { withApi, created, optionsHandler } from '@/server/lib/http';
import { commentsService } from '@/server/services/comments.service';
import { badRequest } from '@/server/lib/errors';
import type { CommentEntity } from '@/server/dto/comments.dto';

export const OPTIONS = optionsHandler;

// collection: /api/v2/comments?entityType=order|task&entityId=<uuid>
export const GET = withApi(async (req: NextRequest) => {
  const sp = new URL(req.url).searchParams;
  const entityType = sp.get('entityType');
  const entityId = sp.get('entityId');
  if ((entityType !== 'order' && entityType !== 'task') || !entityId) throw badRequest('entityType (order|task) и entityId обязательны');
  return commentsService.list(entityType, entityId);
});
export const POST = withApi(async (req: NextRequest, ctx) => created(await commentsService.create(await req.json(), ctx.user)));

// item: /api/v2/comments/[id] — delete (author or admin)
export const DELETE = withApi(async (req: NextRequest, ctx) => commentsService.remove(ctx.params!.id, ctx.user));

// counts: /api/v2/comments/counts?entityType=order|task → [{entityId, count}]
export const COUNTS = withApi(async (req: NextRequest) => {
  const et = new URL(req.url).searchParams.get('entityType');
  if (et !== 'order' && et !== 'task') throw badRequest('entityType (order|task) обязателен');
  return commentsService.counts(et as CommentEntity);
});
