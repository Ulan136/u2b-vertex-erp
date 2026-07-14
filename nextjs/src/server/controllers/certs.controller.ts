import { NextRequest } from 'next/server';
import { withApi, created, optionsHandler } from '@/server/lib/http';
import { certsService } from '@/server/services/certs.service';

export const OPTIONS = optionsHandler;

// collection: /api/v2/certs
export const GET = withApi(async (req: NextRequest) => {
  const sp = new URL(req.url).searchParams;
  return certsService.list({
    source: sp.get('source'),
    archived: sp.get('archived') === 'true',
    type: sp.get('type'),
  });
});
export const POST = withApi(async (req: NextRequest) => created(await certsService.create(await req.json())));

// item: /api/v2/certs/[id]
export const PATCH = withApi(async (req: NextRequest, ctx) => certsService.update(ctx.params!.id, await req.json()));
export const DELETE = withApi(async (req: NextRequest, ctx) => certsService.remove(ctx.params!.id));
