import { db } from '@/db';
import { documents, users } from '@/db/schema';
import { asc, desc, eq } from 'drizzle-orm';

type DocInsert = typeof documents.$inferInsert;

// Список без items (лёгкий) — для таблицы созданных документов.
const listSelection = {
  id: documents.id, type: documents.type, number: documents.number, docNo: documents.docNo,
  docDate: documents.docDate, buyerName: documents.buyerName, total: documents.total,
  bank: documents.bank, createdAt: documents.createdAt, createdByName: users.name,
};

export const documentsRepo = {
  list: () => db.select(listSelection).from(documents)
    .leftJoin(users, eq(documents.createdBy, users.id)).orderBy(desc(documents.createdAt)),

  async findById(id: string) {
    const [row] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
    return row ?? null;
  },

  // Номера существующих документов данного типа — для автонумерации.
  numbersOf: (type: string) =>
    db.select({ number: documents.number }).from(documents).where(eq(documents.type, type)).orderBy(asc(documents.number)),

  async create(data: Record<string, unknown>) {
    const [row] = await db.insert(documents).values(data as unknown as DocInsert).returning();
    return row;
  },

  remove: (id: string) => db.delete(documents).where(eq(documents.id, id)),
};
