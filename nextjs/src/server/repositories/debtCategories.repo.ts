import { db } from '@/db';
import { debtCategories } from '@/db/schema';
import { asc, eq } from 'drizzle-orm';

type CatInsert = typeof debtCategories.$inferInsert;

export const debtCategoriesRepo = {
  listAll: () => db.select().from(debtCategories).orderBy(asc(debtCategories.sortOrder), asc(debtCategories.name)),
  async findById(id: string) { const [r] = await db.select().from(debtCategories).where(eq(debtCategories.id, id)).limit(1); return r ?? null; },
  async create(data: CatInsert) { const [r] = await db.insert(debtCategories).values(data).returning(); return r; },
  async update(id: string, data: Partial<CatInsert>) { const [r] = await db.update(debtCategories).set(data).where(eq(debtCategories.id, id)).returning(); return r ?? null; },
  remove: (id: string) => db.delete(debtCategories).where(eq(debtCategories.id, id)),
};
