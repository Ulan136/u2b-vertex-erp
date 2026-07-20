import { db } from '@/db';
import { sales } from '@/db/schema';
import { desc } from 'drizzle-orm';

type SaleInsert = typeof sales.$inferInsert;

export const salesRepo = {
  list: () => db.select().from(sales).orderBy(desc(sales.createdAt)),

  async create(data: Record<string, unknown>) {
    const [row] = await db.insert(sales).values(data as unknown as SaleInsert).returning();
    return row;
  },
};
