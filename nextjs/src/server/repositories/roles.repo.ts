import { db } from '@/db';
import { roles, users } from '@/db/schema';
import { asc, desc, eq, sql } from 'drizzle-orm';

export const rolesRepo = {
  // Системные роли сверху, затем пользовательские по дате создания.
  list: () => db.select().from(roles).orderBy(desc(roles.isSystem), asc(roles.createdAt)),
  get: async (key: string) => (await db.select().from(roles).where(eq(roles.key, key)).limit(1))[0],
  create: async (row: { key: string; label: string }) => (await db.insert(roles).values(row).returning())[0],
  updateLabel: async (key: string, label: string) =>
    (await db.update(roles).set({ label }).where(eq(roles.key, key)).returning())[0],
  remove: (key: string) => db.delete(roles).where(eq(roles.key, key)),
  usersCount: async (key: string) =>
    Number((await db.select({ n: sql<number>`count(*)` }).from(users).where(eq(users.role, key)))[0]?.n || 0),
};
