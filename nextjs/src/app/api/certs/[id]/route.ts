import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { certificates } from '@/db/schema';
import { eq } from 'drizzle-orm';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    // never let the client overwrite identity/timestamps
    delete body.id; delete body.createdAt;
    const [updated] = await db
      .update(certificates)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(certificates.id, params.id))
      .returning();
    return NextResponse.json(updated, { headers: CORS_HEADERS });
  } catch (err) {
    console.error('[PATCH /api/certs/[id]]', err);
    return NextResponse.json({ error: 'Update error' }, { status: 500, headers: CORS_HEADERS });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await db.delete(certificates).where(eq(certificates.id, params.id));
    return NextResponse.json({ ok: true }, { headers: CORS_HEADERS });
  } catch (err) {
    console.error('[DELETE /api/certs/[id]]', err);
    return NextResponse.json({ error: 'Delete error' }, { status: 500, headers: CORS_HEADERS });
  }
}
