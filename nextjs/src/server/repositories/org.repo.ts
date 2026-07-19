import { db } from '@/db';
import { orgSettings } from '@/db/schema';
import { eq } from 'drizzle-orm';

type OrgInsert = typeof orgSettings.$inferInsert;

export const orgRepo = {
  async get() {
    const [row] = await db.select().from(orgSettings).where(eq(orgSettings.id, 1)).limit(1);
    return row ?? null;
  },
  async upsert(data: Record<string, unknown>) {
    const existing = await orgRepo.get();
    if (existing) {
      const [row] = await db.update(orgSettings)
        .set({ ...(data as Partial<OrgInsert>), updatedAt: new Date() })
        .where(eq(orgSettings.id, 1)).returning();
      return row;
    }
    const [row] = await db.insert(orgSettings).values({ id: 1, ...(data as OrgInsert) }).returning();
    return row;
  },
};
