import { db } from '@/db';
import { auditLog } from '@/db/schema';
import { and, desc, eq, ne, or, ilike, type SQL } from 'drizzle-orm';

type AuditInsert = typeof auditLog.$inferInsert;

export type AuditQuery = {
  userId?: string | null;        // только действия этого пользователя (лента «Мои»)
  entityType?: string | null;    // история конкретной сущности
  entityId?: string | null;
  onlyLogins?: boolean;          // вкладка «Входы»
  excludeLogins?: boolean;       // ленты действий не показывают входы
  q?: string | null;             // поиск по метке/имени
  limit?: number;
  offset?: number;
};

export const auditRepo = {
  // Единственная запись — вставка. Правок/удалений НЕТ (лог неизменяем).
  insert: (data: AuditInsert) => db.insert(auditLog).values(data),

  async list(qy: AuditQuery) {
    const conds: SQL[] = [];
    if (qy.entityType && qy.entityId) {
      conds.push(eq(auditLog.entityType, qy.entityType));
      conds.push(eq(auditLog.entityId, qy.entityId));
    } else {
      if (qy.onlyLogins) conds.push(eq(auditLog.action, 'login'));
      if (qy.excludeLogins) conds.push(ne(auditLog.action, 'login'));
      if (qy.userId) conds.push(eq(auditLog.userId, qy.userId));
    }
    if (qy.q && qy.q.trim()) {
      const like = `%${qy.q.trim()}%`;
      conds.push(or(ilike(auditLog.entityLabel, like), ilike(auditLog.userName, like))!);
    }
    const limit = Math.min(Math.max(Number(qy.limit) || 40, 1), 100);
    const offset = Math.max(Number(qy.offset) || 0, 0);
    const rows = await db.select().from(auditLog)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
      .limit(limit + 1).offset(offset);
    return { items: rows.slice(0, limit), hasMore: rows.length > limit };
  },
};
