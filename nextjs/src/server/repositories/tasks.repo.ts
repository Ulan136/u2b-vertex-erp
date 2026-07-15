import { db } from '@/db';
import { tasks, users } from '@/db/schema';
import { and, eq, ilike, desc, type SQL } from 'drizzle-orm';

type TaskInsert = typeof tasks.$inferInsert;

export type TaskListFilter = {
  assigneeId?: string | null;   // uuid → that assignee, 'none' → unassigned
  q?: string | null;            // search over title
};

// Task row enriched with the resolved assignee name.
const taskSelection = {
  id: tasks.id,
  title: tasks.title,
  description: tasks.description,
  assigneeId: tasks.assigneeId,
  dueDate: tasks.dueDate,
  status: tasks.status,
  createdBy: tasks.createdBy,
  createdAt: tasks.createdAt,
  updatedAt: tasks.updatedAt,
  completedAt: tasks.completedAt,
  assigneeName: users.name,
};

export const tasksRepo = {
  list({ assigneeId, q }: TaskListFilter) {
    const conds: SQL[] = [];
    if (assigneeId && assigneeId !== 'none') conds.push(eq(tasks.assigneeId, assigneeId));
    if (q && q.trim()) conds.push(ilike(tasks.title, `%${q.trim()}%`));
    const base = db.select(taskSelection).from(tasks)
      .leftJoin(users, eq(tasks.assigneeId, users.id));
    return (conds.length ? base.where(and(...conds)) : base).orderBy(desc(tasks.createdAt));
  },

  async findById(id: string) {
    const [row] = await db.select(taskSelection).from(tasks)
      .leftJoin(users, eq(tasks.assigneeId, users.id))
      .where(eq(tasks.id, id)).limit(1);
    return row ?? null;
  },

  async create(data: Record<string, unknown>) {
    const [row] = await db.insert(tasks).values(data as unknown as TaskInsert).returning();
    return row;
  },

  async update(id: string, data: Record<string, unknown>) {
    const [row] = await db.update(tasks)
      .set({ ...(data as Partial<TaskInsert>), updatedAt: new Date() })
      .where(eq(tasks.id, id)).returning();
    return row;
  },

  remove: (id: string) => db.delete(tasks).where(eq(tasks.id, id)),
};
