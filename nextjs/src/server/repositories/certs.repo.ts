import { db, type Executor } from '@/db';
import { certificates, users } from '@/db/schema';
import { and, desc, eq, getTableColumns, sql } from 'drizzle-orm';

type CertInsert = typeof certificates.$inferInsert;
type Source = typeof certificates.source.enumValues[number];

export const certsRepo = {
  list({ source, archived, type, orderId }: { source?: string | null; archived: boolean; type?: string | null; orderId?: string | null }) {
    const conds = [eq(certificates.isArchived, archived)];
    if (type) conds.push(eq(certificates.docType, type));          // без type → все документы (для дашборда)
    if (source) conds.push(eq(certificates.source, source as Source));
    if (orderId) conds.push(eq(certificates.orderId, orderId));    // сертификаты одной заявки
    // photos (base64) в списке НЕ отдаём — только их количество; сами фото по
    // ссылке /api/v2/certs/{id}/photo/{n}. Так списки лёгкие и без дублей.
    const { photos: _photos, ...cols } = getTableColumns(certificates);
    void _photos;
    return db.select({ ...cols, createdByName: users.name, photoCount: sql<number>`coalesce(jsonb_array_length(${certificates.photos}), 0)` }).from(certificates)
      .leftJoin(users, eq(certificates.createdBy, users.id))
      .where(and(...conds)).orderBy(desc(certificates.createdAt));
  },

  async create(data: Record<string, unknown>, exec: Executor = db) {
    const [row] = await exec.insert(certificates).values(data as unknown as CertInsert).returning();
    return row;
  },

  async update(id: string, data: Record<string, unknown>, exec: Executor = db) {
    const [row] = await exec
      .update(certificates)
      .set({ ...(data as Partial<CertInsert>), updatedAt: new Date() })
      .where(eq(certificates.id, id))
      .returning();
    return row;
  },

  remove: (id: string, exec: Executor = db) => exec.delete(certificates).where(eq(certificates.id, id)),
};
