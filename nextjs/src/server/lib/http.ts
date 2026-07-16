import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { ApiError } from './errors';
import { CORS_HEADERS } from './cors';
import { currentUser, type SessionUser } from './session';
import { isCabinetPublicApi, apiScreenFor } from './apiAccess';
import { permissionsRepo } from '@/server/repositories/permissions.repo';
import { isScreenAllowed } from '@/server/dto/permissions.dto';

// ── Response helpers ──────────────────────────────────────────────
export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: CORS_HEADERS });
}
export const ok = (data: unknown) => json(data, 200);
export const created = (data: unknown) => json(data, 201);
export const noContent = () => new NextResponse(null, { status: 204, headers: CORS_HEADERS });
export const optionsHandler = () => noContent();

// ── withApi: auth + access guard + uniform error handling ─────────
// Every wrapped route (except the cabinet allowlist) requires a session, and
// when the path maps to a screen the «Доступы» matrix is enforced for the
// session's role. The resolved user is passed to the handler via ctx.user.
export type RouteCtx = { params?: Record<string, string>; user?: SessionUser | null };
type Handler = (req: NextRequest, ctx: RouteCtx) => Promise<unknown> | unknown;

export function withApi(handler: Handler) {
  return async (req: NextRequest, ctx: RouteCtx): Promise<NextResponse> => {
    let path = req.url;
    let url: URL | null = null;
    try { url = new URL(req.url); path = url.pathname; } catch { /* keep raw url */ }

    try {
      let user: SessionUser | null = null;
      if (!isCabinetPublicApi(req.method, path)) {
        user = await currentUser();
        if (!user) return json({ error: 'Требуется вход' }, 401);
        const screen = url ? apiScreenFor(req.method, path, url.searchParams) : null;
        if (screen) {
          const perms = await permissionsRepo.list();
          if (!isScreenAllowed(user.role, screen, perms)) {
            return json({ error: 'Нет доступа к разделу' }, 403);
          }
        }
      }

      const result = await handler(req, { ...(ctx ?? {}), user });
      return result instanceof NextResponse ? result : json(result);
    } catch (err) {
      if (err instanceof ZodError) {
        console.warn(`[${req.method} ${path}] validation`, err.issues);
        return json({ error: 'Validation error', issues: err.issues }, 400);
      }
      if (err instanceof ApiError) {
        console.warn(`[${req.method} ${path}]`, err.message);
        return json({ error: err.message }, err.status);
      }
      console.error(`[${req.method} ${path}]`, err);
      return json({ error: 'Internal error' }, 500);
    }
  };
}
