import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { financeAccounts, financeOperations } from '@/db/schema';
import { desc } from 'drizzle-orm';

export async function GET() {
  try {
    const [accounts, operations] = await Promise.all([
      db.select().from(financeAccounts),
      db.select().from(financeOperations).orderBy(desc(financeOperations.createdAt)).limit(50),
    ]);
    return NextResponse.json({ accounts, operations });
  } catch {
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const [op] = await db.insert(financeOperations).values(body).returning();
    return NextResponse.json(op, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Op error' }, { status: 500 });
  }
}
