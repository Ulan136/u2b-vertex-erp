import { db } from '@/db';
import { products, stockMovements } from '@/db/schema';
import { eq } from 'drizzle-orm';

type MovementInsert = typeof stockMovements.$inferInsert;

export const productsRepo = {
  listActive: () => db.select().from(products).where(eq(products.isActive, true)),

  async createMovement(data: Record<string, unknown>) {
    const [row] = await db.insert(stockMovements).values(data as unknown as MovementInsert).returning();
    return row;
  },
};
