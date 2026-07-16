import { withApi, optionsHandler } from '@/server/lib/http';

export const OPTIONS = optionsHandler;

// GET /api/v2/me — the signed-in user (id, name, role, email). 401 if not.
export const GET = withApi(async (_req, ctx) => ctx.user);
