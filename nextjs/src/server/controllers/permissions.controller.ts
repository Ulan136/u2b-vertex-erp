import { NextRequest } from 'next/server';
import { withApi, created, optionsHandler } from '@/server/lib/http';
import { permissionsService } from '@/server/services/permissions.service';

export const OPTIONS = optionsHandler;

// GET /api/v2/role-permissions — all stored (role, screen) overrides
export const GET = withApi(async () => permissionsService.list());
// POST /api/v2/role-permissions — upsert one cell { role, screenKey, allowed }
export const POST = withApi(async (req: NextRequest) => created(await permissionsService.upsert(await req.json())));
