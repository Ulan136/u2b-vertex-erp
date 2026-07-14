import { db } from '@/db';
import { sales, stockMovements } from '@/db/schema';
import { desc } from 'drizzle-orm';

type SaleInsert = typeof sales.$inferInsert;
type MovementInsert = typeof stockMovements.$inferInsert;

export const salesRepo = {
  list: () => db.select().from(sales).orderBy(desc(sales.createdAt)),

  async create(data: Record<string, unknown>) {
    const [row] = await db.insert(sales).values(data as unknown as SaleInsert).returning();
    return row;
  },

  createMovement(data: Record<string, unknown>) {
    return db.insert(stockMovements).values(data as unknown as MovementInsert);
  },
};
