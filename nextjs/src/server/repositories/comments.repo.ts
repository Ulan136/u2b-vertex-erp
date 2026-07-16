import { db } from '@/db';
import { comments, users } from '@/db/schema';
import { and, eq, asc, sql } from 'drizzle-orm';

type CommentInsert = typeof comments.$inferInsert;
type Entity = 'order' | 'task';

const selection = {
  id: comments.id,
  entityType: comments.entityType,
  entityId: comments.entityId,
  authorId: comments.authorId,
  text: comments.text,
  createdAt: comments.createdAt,
  authorName: users.name,
};

export const commentsRepo = {
  // oldest → newest (свежие снизу)
  list: (entityType: Entity, entityId: string) =>
    db.select(selection).from(comments).leftJoin(users, eq(comments.authorId, users.id))
      .where(and(eq(comments.entityType, entityType), eq(comments.entityId, entityId)))
      .orderBy(asc(comments.createdAt)),

  counts: (entityType: Entity) =>
    db.select({ entityId: comments.entityId, count: sql<number>`count(*)::int` })
      .from(comments).where(eq(comments.entityType, entityType)).groupBy(comments.entityId),

  async commenterIds(entityType: Entity, entityId: string) {
    const rows = await db.selectDistinct({ id: comments.authorId }).from(comments)
      .where(and(eq(comments.entityType, entityType), eq(comments.entityId, entityId)));
    return rows.map(r => r.id).filter((x): x is string => Boolean(x));
  },

  async create(data: Record<string, unknown>) {
    const [row] = await db.insert(comments).values(data as unknown as CommentInsert).returning();
    return row;
  },

  async findById(id: string) {
    const [row] = await db.select().from(comments).where(eq(comments.id, id)).limit(1);
    return row ?? null;
  },

  remove: (id: string) => db.delete(comments).where(eq(comments.id, id)),
};
