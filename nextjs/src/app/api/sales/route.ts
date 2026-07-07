import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { sales, stockMovements } from '@/db/schema';
import { desc } from 'drizzle-orm';

export async function GET() {
  try {
    const rows = await db.select().from(sales).orderBy(desc(sales.createdAt));
    return NextResponse.json(rows);
  } catch (err) {
    console.error('[GET /api/sales]', err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const [sale] = await db.insert(sales).values(body).returning();
    if (body.productId && body.qty) {
      await db.insert(stockMovements).values({
        productId: body.productId,
        skuCode: body.skuCode,
        productName: body.productName,
        moveType: 'OUT',
        qty: -Math.abs(body.qty),
        price: body.price,
        totalSum: body.totalSum,
        comment: 'Sale: ' + body.clientName,
        author: 'Manager',
      });
    }
    return NextResponse.json(sale, { status: 201 });
  } catch (err) {
    console.error('[POST /api/sales]', err);
    return NextResponse.json({ error: 'Sale error' }, { status: 500 });
  }
}
