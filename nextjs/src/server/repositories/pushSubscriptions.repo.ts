import { db } from '@/db';
import { pushSubscriptions, users } from '@/db/schema';
import { eq, inArray } from 'drizzle-orm';

type PushSubInsert = typeof pushSubscriptions.$inferInsert;

export const pushSubscriptionsRepo = {
  // Подписка уникальна по endpoint: повторная регистрация того же устройства
  // обновляет владельца/ключи, а не плодит дубли.
  async upsert(row: PushSubInsert) {
    await db.insert(pushSubscriptions).values(row).onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId: row.userId, p256dh: row.p256dh, auth: row.auth, userAgent: row.userAgent ?? null },
    });
  },

  // Подписки получателей + их роль (роль нужна, чтобы клик открыл нужный кабинет).
  listByUsers: (userIds: string[]) =>
    userIds.length
      ? db.select({
          endpoint: pushSubscriptions.endpoint,
          p256dh: pushSubscriptions.p256dh,
          auth: pushSubscriptions.auth,
          role: users.role,
        }).from(pushSubscriptions)
          .leftJoin(users, eq(pushSubscriptions.userId, users.id))
          .where(inArray(pushSubscriptions.userId, userIds))
      : Promise.resolve([] as Array<{ endpoint: string; p256dh: string; auth: string; role: string | null }>),

  deleteByEndpoint: (endpoint: string) =>
    db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint)),
};
