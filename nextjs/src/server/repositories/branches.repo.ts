import { db } from '@/db';
import { branches } from '@/db/schema';
import { asc, eq } from 'drizzle-orm';

// Read-only access to branches — the Clients settings tab needs the real
// branch list (with UUIDs) to scope categories and clients.
export const branchesRepo = {
  listActive: () =>
    db.select().from(branches).where(eq(branches.isActive, true)).orderBy(asc(branches.name)),
};
