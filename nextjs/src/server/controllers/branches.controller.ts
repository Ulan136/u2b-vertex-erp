import { NextRequest } from 'next/server';
import { withApi, created, optionsHandler } from '@/server/lib/http';
import { branchesService } from '@/server/services/branches.service';

export const OPTIONS = optionsHandler;

// GET /api/v2/branches → активные (для селектов «Филиал»); ?all=1 → все (управление).
export const GET = withApi(async (req: NextRequest) => branchesService.list(new URL(req.url).searchParams.get('all') === '1'));
// POST /api/v2/branches — создать филиал (управление, «Настройки»).
export const POST = withApi(async (req: NextRequest) => created(await branchesService.create(await req.json())));
// PATCH /api/v2/branches/[id] — правка / назначить головным / активность.
export const PATCH = withApi(async (req: NextRequest, ctx) => branchesService.update(ctx.params!.id, await req.json()));
export const DELETE = withApi(async (_req: NextRequest, ctx) => branchesService.remove(ctx.params!.id));
