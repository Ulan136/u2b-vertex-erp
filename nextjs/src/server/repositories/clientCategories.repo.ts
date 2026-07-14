import { db } from '@/db';
import { clientCategories } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';

type CategoryInsert = typeof clientCategories.$inferInsert;

// Data access for client categories — organization-wide.
export const clientCategoriesRepo = {
  list: () =>
    db.select().from(clientCategories).orderBy(asc(clientCategories.name)),

  async findById(id: string) {
    const [row] = await db.select().from(clientCategories).where(eq(clientCategories.id, id)).limit(1);
    return row ?? null;
  },

  // Guard against duplicate category names.
  async findByName(name: string) {
    const [row] = await db.select().from(clientCategories).where(eq(clientCategories.name, name)).limit(1);
    return row ?? null;
  },

  async create(data: Record<string, unknown>) {
    const [row] = await db.insert(clientCategories).values(data as unknown as CategoryInsert).returning();
    return row;
  },

  async update(id: string, data: Record<string, unknown>) {
    const [row] = await db
      .update(clientCategories)
      .set(data as Partial<CategoryInsert>)
      .where(eq(clientCategories.id, id))
      .returning();
    return row;
  },

  remove: (id: string) => db.delete(clientCategories).where(eq(clientCategories.id, id)),
};
