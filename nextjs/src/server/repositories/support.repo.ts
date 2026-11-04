import { db } from '@/db';
import { supportTickets, users, branches, comments } from '@/db/schema';
import { and, eq, ilike, or, desc, asc, ne, type SQL } from 'drizzle-orm';

type TicketInsert = typeof supportTickets.$inferInsert;

export type SupportListFilter = {
  status?: string | null;     // конкретный статус; 'open' → всё, кроме «Закрыта»
  branchId?: string | null;   // ограничение по филиалу (для роли branch — принудительно)
  q?: string | null;          // поиск по теме и тексту
};

// Строка заявки с подставленными именами автора и филиала.
const ticketSelection = {
  id: supportTickets.id,
  ticketNo: supportTickets.ticketNo,
  branchId: supportTickets.branchId,
  screen: supportTickets.screen,
  title: supportTickets.title,
  body: supportTickets.body,
  severity: supportTickets.severity,
  status: supportTickets.status,
  createdBy: supportTickets.createdBy,
  createdAt: supportTickets.createdAt,
  updatedAt: supportTickets.updatedAt,
  answeredAt: supportTickets.answeredAt,
  closedAt: supportTickets.closedAt,
  createdByName: users.name,
  branchName: branches.name,
};

const withJoins = () => db.select(ticketSelection).from(supportTickets)
  .leftJoin(users, eq(supportTickets.createdBy, users.id))
  .leftJoin(branches, eq(supportTickets.branchId, branches.id));

export const supportRepo = {
  list({ status, branchId, q }: SupportListFilter) {
    const conds: SQL[] = [];
    if (status === 'open') conds.push(ne(supportTickets.status, 'Закрыта'));
    else if (status) conds.push(eq(supportTickets.status, status));
    if (branchId) conds.push(eq(supportTickets.branchId, branchId));
    if (q && q.trim()) {
      const like = `%${q.trim()}%`;
      conds.push(or(ilike(supportTickets.title, like), ilike(supportTickets.body, like)) as SQL);
    }
    const base = withJoins();
    return (conds.length ? base.where(and(...conds)) : base).orderBy(desc(supportTickets.createdAt));
  },

  async findById(id: string) {
    const [row] = await withJoins().where(eq(supportTickets.id, id)).limit(1);
    return row ?? null;
  },

  async create(data: Record<string, unknown>) {
    const [row] = await db.insert(supportTickets).values(data as unknown as TicketInsert).returning();
    return row;
  },

  async update(id: string, data: Record<string, unknown>) {
    const [row] = await db.update(supportTickets)
      .set({ ...(data as Partial<TicketInsert>), updatedAt: new Date() })
      .where(eq(supportTickets.id, id)).returning();
    return row;
  },

  // Переписка по заявке — общая таблица comments, entityType='support'.
  messages(ticketId: string) {
    return db.select({
      id: comments.id,
      text: comments.text,
      authorId: comments.authorId,
      authorName: users.name,
      createdAt: comments.createdAt,
    }).from(comments)
      .leftJoin(users, eq(comments.authorId, users.id))
      .where(and(eq(comments.entityType, 'support'), eq(comments.entityId, ticketId)))
      .orderBy(asc(comments.createdAt));
  },

  async addMessage(ticketId: string, text: string, authorId: string | null) {
    const [row] = await db.insert(comments)
      .values({ entityType: 'support', entityId: ticketId, text, authorId })
      .returning();
    return row;
  },
};
