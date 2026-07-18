import { db } from '@/db';
import { financeAccounts, financeOperations } from '@/db/schema';
import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';

type OpInsert = typeof financeOperations.$inferInsert;
type AccInsert = typeof financeAccounts.$inferInsert;

export const financeRepo = {
  // Счета + операции. С периодом [from,to] возвращаются все операции за период
  // (по opDate); без периода — последние 50 (для дашборда).
  async overview(from?: string | null, to?: string | null) {
    const accounts = await db.select().from(financeAccounts)
      .orderBy(asc(financeAccounts.sortOrder), asc(financeAccounts.name));

    let operations;
    if (from || to) {
      const conds = [];
      if (from) conds.push(gte(financeOperations.opDate, from));
      if (to) conds.push(lte(financeOperations.opDate, to));
      operations = await db.select().from(financeOperations)
        .where(and(...conds))
        .orderBy(desc(financeOperations.opDate), desc(financeOperations.createdAt));
    } else {
      operations = await db.select().from(financeOperations)
        .orderBy(desc(financeOperations.createdAt)).limit(50);
    }
    return { accounts, operations };
  },

  async createOperation(data: Record<string, unknown>) {
    const [row] = await db.insert(financeOperations).values(data as unknown as OpInsert).returning();
    return row;
  },

  // Roll back a ledger operation (used when a debt payment is deleted).
  removeOperation: (id: string) => db.delete(financeOperations).where(eq(financeOperations.id, id)),

  // Сдвинуть баланс счёта на delta (может быть отрицательным).
  adjustBalance: (id: string, delta: number) =>
    db.update(financeAccounts)
      .set({ balance: sql`${financeAccounts.balance} + ${delta}` })
      .where(eq(financeAccounts.id, id)),

  async createAccount(data: Record<string, unknown>) {
    const [row] = await db.insert(financeAccounts).values(data as unknown as AccInsert).returning();
    return row;
  },

  async updateAccount(id: string, data: Record<string, unknown>) {
    const [row] = await db.update(financeAccounts).set(data as Partial<AccInsert>).where(eq(financeAccounts.id, id)).returning();
    return row;
  },
};
