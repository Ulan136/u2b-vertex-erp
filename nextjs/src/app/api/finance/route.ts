import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { financeAccounts, financeOperations } from '@/db/schema';
import { desc } from 'drizzle-orm';

// GET /api/finance — балансы и последние операции
export async function GET() {
  try {
    const [accounts, operations] = await Promise.all([
      db.select().from(financeAccounts),
      db.select().from(financeOperations).orderBy(desc(financeOperations.createdAt)).limit(50),
    ]);
    return NextResponse.json({ accounts, operations });
  } catch (e) {
    return NextResponse.json({ error: 'Ошибка БД' }, { status: 500 });
  }
}

// POST /api/finance — новая операция
// Триггер в БД автоматически обновит баланс счёта
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const [op] = await db
      .insert(financeOperations)
      .values(body)
      .returning();
    return NextResponse.json(op, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: 'Ошибка операции' }, { status: 500 });
  }
}
