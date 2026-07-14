import { NextRequest } from 'next/server';
import { withApi, created, optionsHandler } from '@/server/lib/http';
import { clientsService } from '@/server/services/clients.service';

export const OPTIONS = optionsHandler;

// collection: /api/v2/clients?branchId=..&categoryId=..&q=..
export const GET = withApi(async (req: NextRequest) => {
  const sp = new URL(req.url).searchParams;
  return clientsService.list({
    branchId: sp.get('branchId'),
    categoryId: sp.get('categoryId'),
    q: sp.get('q'),
  });
});
export const POST = withApi(async (req: NextRequest) => created(await clientsService.create(await req.json())));

// item: /api/v2/clients/[id]
export const PATCH = withApi(async (req: NextRequest, ctx) => clientsService.update(ctx.params!.id, await req.json()));
export const DELETE = withApi(async (req: NextRequest, ctx) => clientsService.remove(ctx.params!.id));
