import { NextRequest } from 'next/server';
import { withApi, created, optionsHandler } from '@/server/lib/http';
import { rolesService } from '@/server/services/roles.service';

export const OPTIONS = optionsHandler;

// collection: /api/v2/roles
export const GET = withApi(async () => rolesService.list());
export const POST = withApi(async (req: NextRequest) => created(await rolesService.create(await req.json())));

// item: /api/v2/roles/[key]
export const PATCH = withApi(async (req: NextRequest, ctx) => rolesService.update(ctx.params!.key, await req.json()));
export const DELETE = withApi(async (_req: NextRequest, ctx) => rolesService.remove(ctx.params!.key));
