import { db, type Executor } from '@/db';
import { loans, users, financeAccounts } from '@/db/schema';
import { desc, eq, getTableColumns } from 'drizzle-orm';

export const loansRepo = {
  list: () => db
    .select({ ...getTableColumns(loans), createdByName: users.name, accountName: financeAccounts.name })
    .from(loans)
    .leftJoin(users, eq(loans.createdBy, users.id))
    .leftJoin(financeAccounts, eq(loans.accountId, financeAccounts.id))
    .orderBy(desc(loans.createdAt)),

  async findById(id: string, exec: Executor = db) {
    const [row] = await exec.select().from(loans).where(eq(loans.id, id)).limit(1);
    return row ?? null;
  },

  async create(data: Record<string, unknown>, exec: Executor = db) {
    const [row] = await exec.insert(loans).values(data as typeof loans.$inferInsert).returning();
    return row;
  },

  async update(id: string, data: Record<string, unknown>, exec: Executor = db) {
    const [row] = await exec.update(loans).set(data).where(eq(loans.id, id)).returning();
    return row ?? null;
  },
};
