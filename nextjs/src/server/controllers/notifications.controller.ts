import { NextRequest } from 'next/server';
import { withApi, optionsHandler } from '@/server/lib/http';
import { notificationsService } from '@/server/services/notifications.service';

export const OPTIONS = optionsHandler;

// GET /api/v2/notifications → { unread, items: last 15 } for the session user
export const GET = withApi(async (_req: NextRequest, ctx) => notificationsService.overview(ctx.user!.id));

// POST /api/v2/notifications/[id]/read → mark one read
export const READ = withApi(async (_req: NextRequest, ctx) => notificationsService.markRead(ctx.user!.id, ctx.params!.id));

// POST /api/v2/notifications/read-all → mark all read
export const READ_ALL = withApi(async (_req: NextRequest, ctx) => notificationsService.markAllRead(ctx.user!.id));
