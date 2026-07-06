import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { certificates } from '@/db/schema';
import { eq, desc, and } from 'drizzle-orm';

// GET /api/certs?source=САМИ&archived=false
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const source   = searchParams.get('source');
    const archived = searchParams.get('archived') === 'true';

    const rows = await db
      .select()
      .from(certificates)
      .where(
        and(
          eq(certificates.isArchived, archived),
          source ? eq(certificates.source, source as any) : undefined,
        )
      )
      .orderBy(desc(certificates.createdAt));

    return NextResponse.json(rows);
  } catch (e) {
    return NextResponse.json({ error: 'Ошибка БД' }, { status: 500 });
  }
}

// POST /api/certs — создать новый сертификат
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const [cert] = await db
      .insert(certificates)
      .values(body)
      .returning();
    return NextResponse.json(cert, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: 'Ошибка создания' }, { status: 500 });
  }
}
