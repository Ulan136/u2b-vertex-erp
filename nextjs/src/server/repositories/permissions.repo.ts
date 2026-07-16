import { db } from '@/db';
import { rolePermissions } from '@/db/schema';
import { and, eq } from 'drizzle-orm';

export const permissionsRepo = {
  list: () => db.select().from(rolePermissions),

  // Upsert one (role, screen_key) cell.
  async upsert(role: string, screenKey: string, allowed: boolean) {
    const [row] = await db.insert(rolePermissions)
      .values({ role, screenKey, allowed })
      .onConflictDoUpdate({
        target: [rolePermissions.role, rolePermissions.screenKey],
        set: { allowed, updatedAt: new Date() },
      })
      .returning();
    return row;
  },

  remove: (role: string, screenKey: string) =>
    db.delete(rolePermissions).where(and(eq(rolePermissions.role, role), eq(rolePermissions.screenKey, screenKey))),
};
