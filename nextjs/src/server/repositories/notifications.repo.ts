import { db } from '@/db';
import { notifications } from '@/db/schema';
import { and, eq, desc, sql, inArray } from 'drizzle-orm';

type NotifInsert = typeof notifications.$inferInsert;

export const notificationsRepo = {
  createMany: (rows: NotifInsert[]) =>
    rows.length ? db.insert(notifications).values(rows).returning() : Promise.resolve([]),

  listFor: (userId: string, limit = 15) =>
    db.select().from(notifications).where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt)).limit(limit),

  async unreadCount(userId: string) {
    const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
    return Number(r?.n ?? 0);
  },

  async idsNewestFirst(userId: string) {
    const rows = await db.select({ id: notifications.id }).from(notifications)
      .where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt));
    return rows.map(r => r.id);
  },

  removeMany: (ids: string[]) =>
    ids.length ? db.delete(notifications).where(inArray(notifications.id, ids)) : Promise.resolve(),

  markRead: (userId: string, id: string) =>
    db.update(notifications).set({ isRead: true })
      .where(and(eq(notifications.userId, userId), eq(notifications.id, id))),

  markAllRead: (userId: string) =>
    db.update(notifications).set({ isRead: true })
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false))),
};
