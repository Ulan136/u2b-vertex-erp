import { db } from '@/db';
import { users } from '@/db/schema';
import { asc, eq } from 'drizzle-orm';

// Read-only access to users — the Задачи screen needs the list (with UUIDs)
// to pick a task assignee.
export const usersRepo = {
  listActive: () =>
    db.select({ id: users.id, name: users.name, position: users.position, role: users.role })
      .from(users).where(eq(users.isActive, true)).orderBy(asc(users.name)),
};
