import { db } from '@/db';
import { expenseCategories } from '@/db/schema';
import { asc, eq } from 'drizzle-orm';

type CatInsert = typeof expenseCategories.$inferInsert;

export const expenseCategoriesRepo = {
  listAll: () =>
    db.select().from(expenseCategories)
      .orderBy(asc(expenseCategories.sortOrder), asc(expenseCategories.name)),

  async findById(id: string) {
    const [row] = await db.select().from(expenseCategories).where(eq(expenseCategories.id, id)).limit(1);
    return row ?? null;
  },

  async create(data: Record<string, unknown>) {
    const [row] = await db.insert(expenseCategories).values(data as unknown as CatInsert).returning();
    return row;
  },

  remove: (id: string) => db.delete(expenseCategories).where(eq(expenseCategories.id, id)),
  removeChildren: (parentId: string) => db.delete(expenseCategories).where(eq(expenseCategories.parentId, parentId)),
};
