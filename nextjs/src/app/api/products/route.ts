import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { products, stockMovements } from '@/db/schema';
import { eq } from 'drizzle-orm';

// Public product catalog is read from other origins (e.g. the standalone
// prototype pages), so allow cross-origin GETs.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET() {
  try {
    const rows = await db.select().from(products).where(eq(products.isActive, true));
    return NextResponse.json(rows, { headers: CORS_HEADERS });
  } catch (err) {
    console.error('[GET /api/products]', err);
    return NextResponse.json({ error: 'DB error' }, { status: 500, headers: CORS_HEADERS });
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
