import { db, type Executor } from '@/db';
import { branches, users, orders } from '@/db/schema';
import { asc, eq, ne, sql } from 'drizzle-orm';

type BranchInsert = typeof branches.$inferInsert;
const COLS = { id: branches.id, name: branches.name, city: branches.city, address: branches.address, invoiceType: branches.invoiceType, isHead: branches.isHead, isActive: branches.isActive };

export const branchesRepo = {
  // Active branches — for the «Филиал» selects and the orders filter.
  listActive: () => db.select(COLS).from(branches).where(eq(branches.isActive, true)).orderBy(asc(branches.name)),
  // All branches (incl. inactive) — for management (Настройки → Филиалы).
  listAll: () => db.select(COLS).from(branches).orderBy(asc(branches.name)),

  get: async (id: string) => (await db.select(COLS).from(branches).where(eq(branches.id, id)).limit(1))[0],

  // Head branch id (Тараз) — заявки без филиала считаются его.
  async headId(): Promise<string | null> {
    const [row] = await db.select({ id: branches.id }).from(branches).where(eq(branches.isHead, true)).limit(1);
    return row?.id ?? null;
  },
  headCount: async (exceptId?: string, exec: Executor = db) => Number((await exec.select({ n: sql<number>`count(*)` }).from(branches)
    .where(exceptId ? sql`${branches.isHead} = true and ${branches.id} <> ${exceptId}` : eq(branches.isHead, true)))[0]?.n || 0),

  // Снять флаг головного со всех прочих (ровно один головной).
  clearHeadExcept: (id: string, exec: Executor = db) => exec.update(branches).set({ isHead: false }).where(ne(branches.id, id)),

  create: async (data: Record<string, unknown>, exec: Executor = db) => (await exec.insert(branches).values(data as unknown as BranchInsert).returning(COLS))[0],
  update: async (id: string, data: Record<string, unknown>, exec: Executor = db) => (await exec.update(branches).set(data as Partial<BranchInsert>).where(eq(branches.id, id)).returning(COLS))[0],
  remove: (id: string, exec: Executor = db) => exec.delete(branches).where(eq(branches.id, id)),

  usersCount: async (id: string) => Number((await db.select({ n: sql<number>`count(*)` }).from(users).where(eq(users.branchId, id)))[0]?.n || 0),
  ordersCount: async (id: string) => Number((await db.select({ n: sql<number>`count(*)` }).from(orders).where(eq(orders.branchId, id)))[0]?.n || 0),
};
