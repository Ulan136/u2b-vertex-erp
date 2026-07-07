import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { products, stockMovements } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function GET() {
  try {
    const rows = await db.select().from(products).where(eq(products.isActive, true));
    return NextResponse.json(rows);
  } catch (err) {
    console.error('[GET /api/products]', err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const [move] = await db.insert(stockMovements).values(body).returning();
    return NextResponse.json(move, { status: 201 });
  } catch (err) {
    console.error('[POST /api/products]', err);
    return NextResponse.json({ error: 'Move error' }, { status: 500 });
  }
}
