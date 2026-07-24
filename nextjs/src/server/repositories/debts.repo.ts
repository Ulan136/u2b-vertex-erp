import { db, type Executor } from '@/db';
import { debts, debtPayments, clients, financeAccounts, users } from '@/db/schema';
import { and, or, eq, ilike, gte, lte, desc, asc, type SQL } from 'drizzle-orm';

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
  createdByName: users.name,
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
      .leftJoin(financeAccounts, eq(debts.accountId, financeAccounts.id))
      .leftJoin(users, eq(debts.createdBy, users.id));
    return (conds.length ? base.where(and(...conds)) : base).orderBy(desc(debts.createdAt));
  },

  async findById(id: string, exec: Executor = db) {
    const [row] = await exec.select(debtSelection).from(debts)
      .leftJoin(clients, eq(debts.counterpartyClientId, clients.id))
      .leftJoin(financeAccounts, eq(debts.accountId, financeAccounts.id))
      .leftJoin(users, eq(debts.createdBy, users.id))
      .where(eq(debts.id, id)).limit(1);
    return row ?? null;
  },

  async create(data: Record<string, unknown>, exec: Executor = db) {
    const [row] = await exec.insert(debts).values(data as unknown as DebtInsert).returning();
    return row;
  },

  // Все погашения (для «Журнала оплат») с контрагентом/счётом/суммой долга.
  paymentsJournal({ from, to, q }: { from?: string | null; to?: string | null; q?: string | null }) {
    const conds: SQL[] = [];
    if (from) conds.push(gte(debtPayments.payDate, from));
    if (to) conds.push(lte(debtPayments.payDate, to));
    if (q && q.trim()) { const like = `%${q.trim()}%`; conds.push(or(ilike(debts.counterpartyName, like), ilike(clients.name, like))!); }
    const base = db.select({
      id: debtPayments.id, debtId: debtPayments.debtId, amount: debtPayments.amount, payDate: debtPayments.payDate,
      comment: debtPayments.comment, financeOpId: debtPayments.financeOpId, createdAt: debtPayments.createdAt,
      accountName: financeAccounts.name, authorName: users.name,
      debtType: debts.type, debtAmount: debts.amount, counterpartyName: debts.counterpartyName, clientName: clients.name,
    }).from(debtPayments)
      .leftJoin(debts, eq(debtPayments.debtId, debts.id))
      .leftJoin(clients, eq(debts.counterpartyClientId, clients.id))
      .leftJoin(financeAccounts, eq(debtPayments.accountId, financeAccounts.id))
      .leftJoin(users, eq(debtPayments.createdBy, users.id));
    return (conds.length ? base.where(and(...conds)) : base).orderBy(desc(debtPayments.createdAt));
  },

  async update(id: string, data: Record<string, unknown>, exec: Executor = db) {
    const [row] = await exec.update(debts)
      .set({ ...(data as Partial<DebtInsert>), updatedAt: new Date() })
      .where(eq(debts.id, id)).returning();
    return row;
  },

  remove: (id: string, exec: Executor = db) => exec.delete(debts).where(eq(debts.id, id)),

  // ── payments ──
  listPayments: (debtId: string, exec: Executor = db) =>
    exec.select().from(debtPayments).where(eq(debtPayments.debtId, debtId)).orderBy(asc(debtPayments.createdAt)),

  async findPayment(id: string, exec: Executor = db) {
    const [row] = await exec.select().from(debtPayments).where(eq(debtPayments.id, id)).limit(1);
    return row ?? null;
  },

  async createPayment(data: Record<string, unknown>, exec: Executor = db) {
    const [row] = await exec.insert(debtPayments).values(data as unknown as PaymentInsert).returning();
    return row;
  },

  removePayment: (id: string, exec: Executor = db) => exec.delete(debtPayments).where(eq(debtPayments.id, id)),
};
