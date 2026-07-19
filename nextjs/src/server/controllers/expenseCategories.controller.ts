import { NextRequest } from 'next/server';
import { withApi, created, optionsHandler } from '@/server/lib/http';
import { expenseCategoriesService } from '@/server/services/expenseCategories.service';

export const OPTIONS = optionsHandler;

// collection: /api/v2/expense-categories
export const GET = withApi(async () => expenseCategoriesService.tree());
export const POST = withApi(async (req: NextRequest) => created(await expenseCategoriesService.create(await req.json())));

// item: /api/v2/expense-categories/[id]
export const DELETE = withApi(async (_req: NextRequest, ctx) => expenseCategoriesService.remove(ctx.params!.id));
