import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { ApiError } from './errors';
import { CORS_HEADERS } from './cors';

// ── Response helpers (always carry CORS) ──────────────────────────
export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: CORS_HEADERS });
}
export const ok = (data: unknown) => json(data, 200);
export const created = (data: unknown) => json(data, 201);
export const noContent = () => new NextResponse(null, { status: 204, headers: CORS_HEADERS });
export const optionsHandler = () => noContent();

// ── withApi: wraps a route handler with CORS + uniform error handling ──
// A handler returns plain data (→ 200 JSON) or a NextResponse (passed through,
// e.g. created()/noContent()). Thrown ApiError → its status; ZodError → 400.
export type RouteCtx = { params?: Record<string, string> };
type Handler = (req: NextRequest, ctx: RouteCtx) => Promise<unknown> | unknown;

export function withApi(handler: Handler) {
  return async (req: NextRequest, ctx: RouteCtx): Promise<NextResponse> => {
    let path = req.url;
    try { path = new URL(req.url).pathname; } catch { /* keep raw url */ }
    try {
      const result = await handler(req, ctx ?? {});
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
