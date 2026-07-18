import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { ApiError } from './errors';
import { CORS_HEADERS } from './cors';
import { currentUser, type SessionUser } from './session';
import { isCabinetPublicApi, apiScreenFor, financeWriteAllowed } from './apiAccess';
import { permissionsRepo } from '@/server/repositories/permissions.repo';
import { isScreenAllowed } from '@/server/dto/permissions.dto';
import { presenceService } from '@/server/services/presence.service';

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
      // Resolve the session user always (even on public cabinet routes) so an
      // authenticated ERP request that hits a public endpoint (e.g. creating an
      // order) still carries ctx.user — the cabinet stays usable anonymously.
      const user: SessionUser | null = await currentUser();
      if (!isCabinetPublicApi(req.method, path)) {
        if (!user) return json({ error: 'Требуется вход' }, 401);
        await presenceService.touch(user.id);   // presence (throttled to ≤1 write/min)
        // Финансы: запись только Админу/Бухгалтеру (Директор и др. — только чтение)
        if (!financeWriteAllowed(req.method, path, user.role)) {
          return json({ error: 'Финансы: только просмотр для вашей роли' }, 403);
        }
        const screen = url ? apiScreenFor(req.method, path, url.searchParams) : null;
        if (screen) {
          const perms = await permissionsRepo.list();
          if (!isScreenAllowed(user.role, screen, perms)) {
            return json({ error: 'Нет доступа к разделу' }, 403);
          }
        }
      } else if (user) {
        await presenceService.touch(user.id);    // ERP user on a public route — keep presence fresh
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
