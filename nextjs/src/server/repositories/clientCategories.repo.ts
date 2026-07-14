import { db } from '@/db';
import { clientCategories } from '@/db/schema';
import { and, eq, asc } from 'drizzle-orm';

type CategoryInsert = typeof clientCategories.$inferInsert;

// Data access for client categories — one branch's categories are never
// visible to another, so every read is scoped by branchId.
export const clientCategoriesRepo = {
  listByBranch: (branchId: string) =>
    db.select().from(clientCategories).where(eq(clientCategories.branchId, branchId)).orderBy(asc(clientCategories.name)),

  async findById(id: string) {
    const [row] = await db.select().from(clientCategories).where(eq(clientCategories.id, id)).limit(1);
    return row ?? null;
  },

  // Guard against duplicate category names within the same branch.
  async findByName(branchId: string, name: string) {
    const [row] = await db
      .select()
      .from(clientCategories)
      .where(and(eq(clientCategories.branchId, branchId), eq(clientCategories.name, name)))
      .limit(1);
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
