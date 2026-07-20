import { NextRequest } from 'next/server';
import { withApi, created, optionsHandler } from '@/server/lib/http';
import { salesService } from '@/server/services/sales.service';

export const OPTIONS = optionsHandler;

export const GET = withApi(async () => salesService.list());
export const POST = withApi(async (req: NextRequest, ctx) =>
  created(await salesService.create(await req.json(), ctx.user ? { id: ctx.user.id, name: ctx.user.name } : null)));
