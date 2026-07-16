import { db } from '@/db';
import { users } from '@/db/schema';
import { and, asc, eq, sql } from 'drizzle-orm';

type UserInsert = typeof users.$inferInsert;

// Fields safe to expose to the management UI (never the password hash).
const mgmtSelection = {
  id: users.id,
  name: users.name,
  phone: users.phone,
  position: users.position,
  role: users.role,
  email: users.email,
  isActive: users.isActive,
};

export const usersRepo = {
  // Minimal list of active users — for assignee/user pickers.
  listActive: () =>
    db.select({ id: users.id, name: users.name, position: users.position, role: users.role })
      .from(users).where(eq(users.isActive, true)).orderBy(asc(users.name)),

  // Full list (incl. inactive) — for the management table.
  listAll: () => db.select(mgmtSelection).from(users).orderBy(asc(users.name)),

  async findById(id: string) {
    const [row] = await db.select(mgmtSelection).from(users).where(eq(users.id, id)).limit(1);
    return row ?? null;
  },

  async findByEmail(email: string) {
    const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    return row ?? null;
  },

  async countActiveAdmins() {
    const [row] = await db.select({ n: sql<number>`count(*)::int` })
      .from(users).where(and(eq(users.role, 'admin'), eq(users.isActive, true)));
    return Number(row?.n ?? 0);
  },

  async create(data: Record<string, unknown>) {
    const [row] = await db.insert(users).values(data as unknown as UserInsert).returning(mgmtSelection);
    return row;
  },

  async update(id: string, data: Record<string, unknown>) {
    const [row] = await db.update(users)
      .set({ ...(data as Partial<UserInsert>), updatedAt: new Date() })
      .where(eq(users.id, id)).returning(mgmtSelection);
    return row;
  },
};
