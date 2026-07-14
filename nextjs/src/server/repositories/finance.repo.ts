import { db } from '@/db';
import { financeAccounts, financeOperations } from '@/db/schema';
import { desc } from 'drizzle-orm';

type OpInsert = typeof financeOperations.$inferInsert;

export const financeRepo = {
  async overview() {
    const [accounts, operations] = await Promise.all([
      db.select().from(financeAccounts),
      db.select().from(financeOperations).orderBy(desc(financeOperations.createdAt)).limit(50),
    ]);
    return { accounts, operations };
  },

  async createOperation(data: Record<string, unknown>) {
    const [row] = await db.insert(financeOperations).values(data as unknown as OpInsert).returning();
    return row;
  },
};
