import { db } from '@/db';
import { certificates, users } from '@/db/schema';
import { and, desc, eq, getTableColumns } from 'drizzle-orm';

type CertInsert = typeof certificates.$inferInsert;
type Source = typeof certificates.source.enumValues[number];

export const certsRepo = {
  list({ source, archived, type }: { source?: string | null; archived: boolean; type: string }) {
    const conds = [
      eq(certificates.isArchived, archived),
      eq(certificates.docType, type),
    ];
    if (source) conds.push(eq(certificates.source, source as Source));
    return db.select({ ...getTableColumns(certificates), createdByName: users.name }).from(certificates)
      .leftJoin(users, eq(certificates.createdBy, users.id))
      .where(and(...conds)).orderBy(desc(certificates.createdAt));
  },

  async create(data: Record<string, unknown>) {
    const [row] = await db.insert(certificates).values(data as unknown as CertInsert).returning();
    return row;
  },

  async update(id: string, data: Record<string, unknown>) {
    const [row] = await db
      .update(certificates)
      .set({ ...(data as Partial<CertInsert>), updatedAt: new Date() })
      .where(eq(certificates.id, id))
      .returning();
    return row;
  },

  remove: (id: string) => db.delete(certificates).where(eq(certificates.id, id)),
};
