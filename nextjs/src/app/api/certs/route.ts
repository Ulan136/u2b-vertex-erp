import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { certificates } from '@/db/schema';
import { eq, desc, and } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const source = searchParams.get('source');
    const archived = searchParams.get('archived') === 'true';

    const conditions = [eq(certificates.isArchived, archived)];
    if (source) {
      conditions.push(
        eq(certificates.source, source as typeof certificates.source.enumValues[number])
      );
    }

    const rows = await db
      .select()
      .from(certificates)
      .where(and(...conditions))
      .orderBy(desc(certificates.createdAt));

    return NextResponse.json(rows);
  } catch (err) {
    console.error('[GET /api/certs]', err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const [cert] = await db.insert(certificates).values(body).returning();
    return NextResponse.json(cert, { status: 201 });
  } catch (err) {
    console.error('[POST /api/certs]', err);
    return NextResponse.json({ error: 'Create error' }, { status: 500 });
  }
}
