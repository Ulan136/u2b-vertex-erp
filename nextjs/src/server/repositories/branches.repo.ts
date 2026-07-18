import { db } from '@/db';
import { branches } from '@/db/schema';
import { asc, eq } from 'drizzle-orm';

export const branchesRepo = {
  // Active branches — for the «Филиал» selects and the orders filter.
  listActive: () =>
    db.select({ id: branches.id, name: branches.name, city: branches.city, isHead: branches.isHead })
      .from(branches).where(eq(branches.isActive, true)).orderBy(asc(branches.name)),

  // Head branch id (Алматы) — заявки без филиала считаются его.
  async headId(): Promise<string | null> {
    const [row] = await db.select({ id: branches.id }).from(branches).where(eq(branches.isHead, true)).limit(1);
    return row?.id ?? null;
  },
};
