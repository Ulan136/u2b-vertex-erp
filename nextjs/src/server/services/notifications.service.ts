import { notificationsRepo } from '@/server/repositories/notifications.repo';
import { idsToPrune } from '@/server/dto/notifications.dto';

const MAX_PER_USER = 100;

export const notificationsService = {
  // Best-effort: notifications must never break the operation that triggered them.
  async create(userIds: string[], payload: { type: string; title: string; link?: string | null }) {
    const ids = Array.from(new Set(userIds.filter(Boolean)));
    if (!ids.length) return;
    try {
      await notificationsRepo.createMany(ids.map(userId => ({
        userId, type: payload.type, title: payload.title.slice(0, 300), link: payload.link ?? null,
      })));
      // keep only the 100 newest per recipient
      for (const userId of ids) {
        const all = await notificationsRepo.idsNewestFirst(userId);
        await notificationsRepo.removeMany(idsToPrune(all, MAX_PER_USER));
      }
    } catch (e) {
      console.warn('[notifications] create failed:', (e as Error).message);
    }
  },

  async overview(userId: string) {
    const [items, unread] = await Promise.all([
      notificationsRepo.listFor(userId, 15),
      notificationsRepo.unreadCount(userId),
    ]);
    return { unread, items };
  },

  markRead: (userId: string, id: string) => notificationsRepo.markRead(userId, id).then(() => ({ ok: true })),
  markAllRead: (userId: string) => notificationsRepo.markAllRead(userId).then(() => ({ ok: true })),
};
