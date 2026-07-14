import { db } from '@/db';
import { orders } from '@/db/schema';
import { desc, eq } from 'drizzle-orm';

type OrderInsert = typeof orders.$inferInsert;

// Data access for orders — the only place that talks to Drizzle for this table.
export const ordersRepo = {
  list: () => db.select().from(orders).orderBy(desc(orders.createdAt)),

  listNos: () => db.select({ no: orders.orderNo }).from(orders),

  async create(data: Record<string, unknown>) {
    const [row] = await db.insert(orders).values(data as unknown as OrderInsert).returning();
    return row;
  },

  async update(id: string, data: Record<string, unknown>) {
    const [row] = await db
      .update(orders)
      .set({ ...(data as Partial<OrderInsert>), updatedAt: new Date() })
      .where(eq(orders.id, id))
      .returning();
    return row;
  },

  remove: (id: string) => db.delete(orders).where(eq(orders.id, id)),
};
