import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { sales, stockMovements, products } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';

// GET /api/sales
export async function GET() {
  try {
    const rows = await db.select().from(sales).orderBy(desc(sales.createdAt));
    return NextResponse.json(rows);
  } catch (e) {
    return NextResponse.json({ error: 'Ошибка БД' }, { status: 500 });
  }
}

// POST /api/sales — новая продажа + автосписание со склада
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // 1. Создаём продажу
    const [sale] = await db.insert(sales).values(body).returning();

    // 2. Если есть productId — списываем со склада
    if (body.productId && body.qty) {
      await db.insert(stockMovements).values({
        productId:   body.productId,
        skuCode:     body.skuCode,
        productName: body.productName,
        moveType:    'OUT',
        qty:         -Math.abs(body.qty),
        price:       body.price,
        totalSum:    body.totalSum,
        comment:     'Продажа: ' + body.clientName,
        author:      'Менеджер',
      });
    }

    return NextResponse.json(sale, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: 'Ошибка продажи' }, { status: 500 });
  }
}
