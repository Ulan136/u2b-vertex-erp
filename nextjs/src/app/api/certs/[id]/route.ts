import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { certificates } from '@/db/schema';
import { eq } from 'drizzle-orm';

// PATCH /api/certs/:id — обновить статус/данные
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
  } catch (e) {
    return NextResponse.json({ error: 'Ошибка обновления' }, { status: 500 });
  }
}

// DELETE /api/certs/:id
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await db.delete(certificates).where(eq(certificates.id, params.id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: 'Ошибка удаления' }, { status: 500 });
  }
}
