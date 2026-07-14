import { NextRequest } from 'next/server';
import { withApi, created, optionsHandler } from '@/server/lib/http';
import { clientCategoriesService } from '@/server/services/clientCategories.service';

export const OPTIONS = optionsHandler;

// collection: /api/v2/client-categories?branchId=..
export const GET = withApi(async (req: NextRequest) => {
  const sp = new URL(req.url).searchParams;
  return clientCategoriesService.list(sp.get('branchId'));
});
export const POST = withApi(async (req: NextRequest) => created(await clientCategoriesService.create(await req.json())));

// item: /api/v2/client-categories/[id]
export const PATCH = withApi(async (req: NextRequest, ctx) => clientCategoriesService.update(ctx.params!.id, await req.json()));
export const DELETE = withApi(async (req: NextRequest, ctx) => clientCategoriesService.remove(ctx.params!.id));
