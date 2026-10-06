import { NextRequest } from 'next/server';
import { withApi, optionsHandler } from '@/server/lib/http';
import { pushService } from '@/server/services/push.service';

export const OPTIONS = optionsHandler;

// GET /api/v2/push/public-key → { key } — публичный VAPID (не секрет), для подписки.
export const PUBLIC_KEY = withApi(async () => ({ key: pushService.publicKey() }));

// POST /api/v2/push/subscribe { subscription } → сохранить подписку текущего пользователя.
export const SUBSCRIBE = withApi(async (req: NextRequest, ctx) => {
  const body = await req.json().catch(() => ({}));
  return pushService.subscribe(ctx.user!.id, body?.subscription ?? body, req.headers.get('user-agent'));
});

// POST /api/v2/push/unsubscribe { endpoint } → удалить подписку.
export const UNSUBSCRIBE = withApi(async (req: NextRequest) => {
  const body = await req.json().catch(() => ({}));
  return pushService.unsubscribe(body?.endpoint || '');
});
