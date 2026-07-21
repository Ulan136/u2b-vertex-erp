import { db, type Executor } from '@/db';
import { orders } from '@/db/schema';
import { desc, eq, sql } from 'drizzle-orm';
import type { OrderSource } from '@/server/dto/orders.dto';
import { ORDER_NO_PREFIX } from '@/server/dto/orders.dto';

type OrderInsert = typeof orders.$inferInsert;

// Секвенс номеров заявок по источнику (без гонок/задвоений).
const ORDER_SEQ: Record<OrderSource, string> = {
  field_check: 'orders_field_no_seq',
  tec: 'orders_tec_no_seq',
};

// Data access for orders — the only place that talks to Drizzle for this table.
export const ordersRepo = {
  list: () => db.select().from(orders).orderBy(desc(orders.createdAt)),

  // Следующий номер заявки из секвенса: префикс источника + NNN.
  async nextOrderNo(source: OrderSource, exec: Executor = db): Promise<string> {
    const res = await exec.execute(sql`select nextval(${ORDER_SEQ[source] ?? ORDER_SEQ.field_check}::regclass) as n`);
    const n = Number((res as unknown as { rows?: Array<{ n: string | number }> }).rows?.[0]?.n
      ?? (res as unknown as Array<{ n: string | number }>)[0]?.n ?? 0);
    return (ORDER_NO_PREFIX[source] ?? ORDER_NO_PREFIX.field_check) + String(n).padStart(3, '0');
  },

  async findById(id: string) {
    const [row] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    return row ?? null;
  },

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
