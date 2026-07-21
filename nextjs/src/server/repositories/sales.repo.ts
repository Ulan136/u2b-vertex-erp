import { db, type Executor } from '@/db';
import { sales, users } from '@/db/schema';
import { desc, eq, sql, getTableColumns } from 'drizzle-orm';

type SaleInsert = typeof sales.$inferInsert;

export const salesRepo = {
  list: () => db.select({ ...getTableColumns(sales), createdByName: users.name }).from(sales)
    .leftJoin(users, eq(sales.createdBy, users.id)).orderBy(desc(sales.createdAt)),

  async findById(id: string, exec: Executor = db) {
    const [row] = await exec.select().from(sales).where(eq(sales.id, id)).limit(1);
    return row ?? null;
  },

  markCancelled: (id: string, actorId: string | null, exec: Executor = db) =>
    exec.update(sales).set({ cancelledAt: new Date(), cancelledBy: actorId, updatedAt: new Date() }).where(eq(sales.id, id)),

  // Номер продажи из секвенса БД (без гонок и задвоений). ПРД-NNN.
  async nextSaleNo(exec: Executor = db): Promise<string> {
    const res = await exec.execute(sql`select nextval('sales_no_seq') as n`);
    const n = Number((res as unknown as { rows?: Array<{ n: string | number }> }).rows?.[0]?.n
      ?? (res as unknown as Array<{ n: string | number }>)[0]?.n ?? 0);
    return 'ПРД-' + String(n).padStart(3, '0');
  },

  async create(data: Record<string, unknown>, exec: Executor = db) {
    const [row] = await exec.insert(sales).values(data as unknown as SaleInsert).returning();
    return row;
  },
};
