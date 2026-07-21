import { db, type Executor } from '@/db';
import { products, stockMovements } from '@/db/schema';
import { asc, desc, eq, sql } from 'drizzle-orm';

type MovementInsert = typeof stockMovements.$inferInsert;

export const productsRepo = {
  listActive: () =>
    db.select().from(products).where(eq(products.isActive, true)).orderBy(asc(products.skuCode)),

  async findById(id: string, exec: Executor = db) {
    const [row] = await exec.select().from(products).where(eq(products.id, id)).limit(1);
    return row ?? null;
  },

  async createMovement(data: Record<string, unknown>, exec: Executor = db) {
    const [row] = await exec.insert(stockMovements).values(data as unknown as MovementInsert).returning();
    return row;
  },

  // Сдвиг остатка (delta может быть отрицательным). Остаток = products.current_stock,
  // ведётся движениями (как баланс счёта в финансах).
  adjustStock: (id: string, delta: number, exec: Executor = db) =>
    exec.update(products)
      .set({ currentStock: sql`${products.currentStock} + ${delta}`, updatedAt: new Date() })
      .where(eq(products.id, id)),

  listMovements: (limit = 60) =>
    db.select().from(stockMovements).orderBy(desc(stockMovements.createdAt), desc(stockMovements.moveDate)).limit(limit),
};
