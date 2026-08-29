import { NextRequest } from 'next/server';
import { withApi, created, optionsHandler } from '@/server/lib/http';
import { transitService } from '@/server/services/transit.service';

export const OPTIONS = optionsHandler;

// POST /api/v2/transit — провести перекупку (создаёт пару долгов, без склада)
export const POST = withApi(async (req: NextRequest, ctx) => created(await transitService.create(await req.json(), ctx.user?.id ?? null)));
