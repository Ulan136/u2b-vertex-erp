import { db } from '@/db';
import { clients, users } from '@/db/schema';
import { and, or, eq, ilike, isNull, desc, sql, getTableColumns, type SQL } from 'drizzle-orm';

type ClientInsert = typeof clients.$inferInsert;

export type ClientListFilter = {
  categoryId?: string | null;   // uuid → that category, 'none' → uncategorized, undefined → all
  q?: string | null;            // search over name / phone
  kind?: string | null;         // 'client' | 'buyer' → tab; undefined → all
};

// Data access for clients — the only place that talks to Drizzle for this table.
export const clientsRepo = {
  list({ categoryId, q, kind }: ClientListFilter) {
    const conds: SQL[] = [];
    if (kind) conds.push(eq(clients.kind, kind));
    if (categoryId === 'none') conds.push(isNull(clients.categoryId));
    else if (categoryId) conds.push(eq(clients.categoryId, categoryId));
    if (q && q.trim()) {
      const like = `%${q.trim()}%`;
      conds.push(or(ilike(clients.name, like), ilike(clients.phone, like))!);
    }
    const query = db.select({ ...getTableColumns(clients), createdByName: users.name })
      .from(clients).leftJoin(users, eq(clients.createdBy, users.id));
    return (conds.length ? query.where(and(...conds)) : query).orderBy(desc(clients.createdAt));
  },

  // Записи с таким же (регистронезависимым) именем — для дедупликации самообучения.
  matchingName: (nameKey: string) =>
    db.select().from(clients).where(sql`lower(${clients.name}) = ${nameKey}`),

  async findById(id: string) {
    const [row] = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
    return row ?? null;
  },

  async create(data: Record<string, unknown>) {
    const [row] = await db.insert(clients).values(data as unknown as ClientInsert).returning();
    return row;
  },

  async update(id: string, data: Record<string, unknown>) {
    const [row] = await db
      .update(clients)
      .set({ ...(data as Partial<ClientInsert>), updatedAt: new Date() })
      .where(eq(clients.id, id))
      .returning();
    return row;
  },

  remove: (id: string) => db.delete(clients).where(eq(clients.id, id)),

  // On category delete, move its clients to "без категории" (category_id → null).
  clearCategory: (categoryId: string) =>
    db.update(clients).set({ categoryId: null, updatedAt: new Date() }).where(eq(clients.categoryId, categoryId)),
};
