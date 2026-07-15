import { db } from '@/db';
import { debts, debtPayments, clients, financeAccounts } from '@/db/schema';
import { and, or, eq, ilike, desc, asc, type SQL } from 'drizzle-orm';

type DebtInsert = typeof debts.$inferInsert;
type PaymentInsert = typeof debtPayments.$inferInsert;

export type DebtListFilter = {
  type?: string | null;        // 'debit' | 'credit'
  status?: string | null;      // 'open' | 'partial' | 'closed'
  accountId?: string | null;
  q?: string | null;           // search by counterparty (name or linked client)
};

// Debt row enriched with the resolved counterparty client name + account name.
const debtSelection = {
  id: debts.id,
  type: debts.type,
  counterpartyClientId: debts.counterpartyClientId,
  counterpartyName: debts.counterpartyName,
  amount: debts.amount,
  paidAmount: debts.paidAmount,
  accountId: debts.accountId,
  dueDate: debts.dueDate,
  comment: debts.comment,
  status: debts.status,
  createdAt: debts.createdAt,
  updatedAt: debts.updatedAt,
  clientName: clients.name,
  accountName: financeAccounts.name,
};

export const debtsRepo = {
  list({ type, status, accountId, q }: DebtListFilter) {
    const conds: SQL[] = [];
    if (type === 'debit' || type === 'credit') conds.push(eq(debts.type, type));
    if (status === 'open' || status === 'partial' || status === 'closed') conds.push(eq(debts.status, status));
    if (accountId) conds.push(eq(debts.accountId, accountId));
    if (q && q.trim()) {
      const like = `%${q.trim()}%`;
      conds.push(or(ilike(debts.counterpartyName, like), ilike(clients.name, like))!);
    }
    const base = db.select(debtSelection).from(debts)
      .leftJoin(clients, eq(debts.counterpartyClientId, clients.id))
      .leftJoin(financeAccounts, eq(debts.accountId, financeAccounts.id));
    return (conds.length ? base.where(and(...conds)) : base).orderBy(desc(debts.createdAt));
  },

  async findById(id: string) {
    const [row] = await db.select(debtSelection).from(debts)
      .leftJoin(clients, eq(debts.counterpartyClientId, clients.id))
      .leftJoin(financeAccounts, eq(debts.accountId, financeAccounts.id))
      .where(eq(debts.id, id)).limit(1);
    return row ?? null;
  },

  async create(data: Record<string, unknown>) {
    const [row] = await db.insert(debts).values(data as unknown as DebtInsert).returning();
    return row;
  },

  async update(id: string, data: Record<string, unknown>) {
    const [row] = await db.update(debts)
      .set({ ...(data as Partial<DebtInsert>), updatedAt: new Date() })
      .where(eq(debts.id, id)).returning();
    return row;
  },

  remove: (id: string) => db.delete(debts).where(eq(debts.id, id)),

  // ── payments ──
  listPayments: (debtId: string) =>
    db.select().from(debtPayments).where(eq(debtPayments.debtId, debtId)).orderBy(asc(debtPayments.createdAt)),

  async findPayment(id: string) {
    const [row] = await db.select().from(debtPayments).where(eq(debtPayments.id, id)).limit(1);
    return row ?? null;
  },

  async createPayment(data: Record<string, unknown>) {
    const [row] = await db.insert(debtPayments).values(data as unknown as PaymentInsert).returning();
    return row;
  },

  removePayment: (id: string) => db.delete(debtPayments).where(eq(debtPayments.id, id)),
};
