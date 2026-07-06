import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { products, stockMovements } from '@/db/schema';
import { eq } from 'drizzle-orm';

// GET /api/products — все товары
export async function GET() {
  try {
    const rows = await db.select().from(products).where(eq(products.isActive, true));
    return NextResponse.json(rows);
  } catch (e) {
    return NextResponse.json({ error: 'Ошибка БД' }, { status: 500 });
  }
}

// POST /api/products/move — движение склада (приход/расход/ревизия)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // Триггер в БД автоматически обновит current_stock
    const [move] = await db
      .insert(stockMovements)
      .values(body)
      .returning();
    return NextResponse.json(move, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: 'Ошибка движения' }, { status: 500 });
  }
}
