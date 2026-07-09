import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { orders } from '@/db/schema';
import { desc } from 'drizzle-orm';

// Orders bridge the ERP (Заявки) and the master cabinet — both cross-origin.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET() {
  try {
    const rows = await db.select().from(orders).orderBy(desc(orders.createdAt));
    return NextResponse.json(rows, { headers: CORS_HEADERS });
  } catch (err) {
    console.error('[GET /api/orders]', err);
    return NextResponse.json({ error: 'DB error' }, { status: 500, headers: CORS_HEADERS });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const [order] = await db.insert(orders).values(body).returning();
    return NextResponse.json(order, { status: 201, headers: CORS_HEADERS });
  } catch (err) {
    console.error('[POST /api/orders]', err);
    return NextResponse.json({ error: 'Create error' }, { status: 500, headers: CORS_HEADERS });
  }
}
