import { NextRequest } from 'next/server';
import { withApi, created, optionsHandler } from '@/server/lib/http';
import { debtCategoriesService } from '@/server/services/debtCategories.service';

export const OPTIONS = optionsHandler;
export const GET = withApi(async () => debtCategoriesService.list());
export const POST = withApi(async (req: NextRequest) => created(await debtCategoriesService.create(await req.json())));
export const PATCH = withApi(async (req: NextRequest, ctx) => debtCategoriesService.update(ctx.params!.id, await req.json()));
export const DELETE = withApi(async (_req: NextRequest, ctx) => debtCategoriesService.remove(ctx.params!.id));
