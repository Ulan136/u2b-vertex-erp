import webpush from 'web-push';
import { pushSubscriptionsRepo } from '@/server/repositories/pushSubscriptions.repo';
import { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, pushConfigured } from '@/server/lib/pushConfig';
import { badRequest } from '@/server/lib/errors';

let vapidSet = false;
function ensureVapid(): boolean {
  if (vapidSet) return true;
  if (!pushConfigured()) return false;              // нет приватного ключа → тихо не шлём
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  vapidSet = true;
  return true;
}

// Куда ведёт клик по пушу — в кабинет получателя (в его PWA-scope), по роли.
function urlForRole(role?: string | null): string {
  if (role === 'master') return '/master';
  if (role === 'director') return '/director';
  if (role === 'branch') return '/erp/branch-finance';
  return '/erp';
}

type WebPushError = { statusCode?: number };

export const pushService = {
  publicKey: () => VAPID_PUBLIC_KEY,

  async subscribe(userId: string, sub: unknown, userAgent?: string | null) {
    const s = sub as { endpoint?: string; keys?: { p256dh?: string; auth?: string } } | null;
    if (!s?.endpoint || !s.keys?.p256dh || !s.keys?.auth) throw badRequest('Некорректная подписка');
    await pushSubscriptionsRepo.upsert({
      userId, endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth,
      userAgent: (userAgent || '').slice(0, 300) || null,
    });
    return { ok: true };
  },

  async unsubscribe(endpoint: string) {
    if (endpoint) await pushSubscriptionsRepo.deleteByEndpoint(endpoint);
    return { ok: true };
  },

  // Best-effort: системный пуш на устройства получателей. Никогда не роняет
  // вызвавшую операцию. Протухшие подписки (404/410) удаляем.
  async sendToUsers(userIds: string[], payload: { title: string; body?: string }) {
    try {
      if (!ensureVapid()) return;
      const ids = Array.from(new Set((userIds || []).filter(Boolean)));
      if (!ids.length) return;
      const subs = await pushSubscriptionsRepo.listByUsers(ids);
      await Promise.all(subs.map(async (s) => {
        const data = JSON.stringify({ title: payload.title, body: payload.body || '', url: urlForRole(s.role) });
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, data);
        } catch (e) {
          const code = (e as WebPushError).statusCode;
          if (code === 404 || code === 410) await pushSubscriptionsRepo.deleteByEndpoint(s.endpoint);
        }
      }));
    } catch (e) {
      console.warn('[push] send failed:', (e as Error).message);
    }
  },
};
