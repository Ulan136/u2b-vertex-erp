import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { certificates } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const [updated] = await db
      .update(certificates)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(certificates.id, params.id))
      .returning();
    return NextResponse.json(updated);
  } catch (err) {
    console.error('[PATCH /api/certs/[id]]', err);
    return NextResponse.json({ error: 'Update error' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await db.delete(certificates).where(eq(certificates.id, params.id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /api/certs/[id]]', err);
    return NextResponse.json({ error: 'Delete error' }, { status: 500 });
  }
}
