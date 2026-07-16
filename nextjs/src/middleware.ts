import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import { authConfig } from '@/lib/auth.config';
import { isCabinetPublicApi } from '@/server/lib/apiAccess';

const { auth } = NextAuth(authConfig);

// Without a session only these are reachable:
//   - /login, the client cabinets (/cabinet, /cabinet/tec) and next-auth routes,
//   - the cabinet's public API ops (submit order + cabinet URL).
// Everything else (the ERP app, all other /api/v2/*) requires a login.
// Canonical host — the legacy u2b-api domain permanently redirects here.
const CANONICAL_HOST = 'u2b-vertex-erp.vercel.app';
const LEGACY_HOSTS = new Set(['u2b-api.vercel.app', 'u2b-vertex-api.vercel.app']);

export default auth((req) => {
  // Consolidation: 308 (method + body preserved) from the old u2b-api domain to
  // the canonical host, keeping the path + query so client cabinet links that
  // were already sent out keep working (u2b-api/cabinet/... → canonical/cabinet/...).
  const host = (req.headers.get('host') || '').toLowerCase();
  if (LEGACY_HOSTS.has(host)) {
    return NextResponse.redirect(
      new URL(req.nextUrl.pathname + req.nextUrl.search, `https://${CANONICAL_HOST}`),
      308,
    );
  }

  const { pathname } = req.nextUrl;
  const loggedIn = !!req.auth?.user;
  const role = (req.auth?.user as { role?: string } | undefined)?.role;

  const publicPage =
    pathname === '/login' ||
    pathname === '/cabinet' || pathname.startsWith('/cabinet/') ||
    pathname.startsWith('/api/auth');

  if (publicPage) return NextResponse.next();
  if (isCabinetPublicApi(req.method, pathname)) return NextResponse.next();

  // /sketch/* — архив старых макетов, доступ только Админу
  if (pathname.startsWith('/sketch/')) {
    if (!loggedIn) {
      const url = new URL('/login', req.nextUrl);
      url.searchParams.set('from', pathname);
      return NextResponse.redirect(url);
    }
    if (role !== 'admin') return NextResponse.redirect(new URL('/', req.nextUrl));
    return NextResponse.next();
  }

  if (loggedIn) return NextResponse.next();

  // not logged in → 401 for API, redirect to /login for pages
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Требуется вход' }, { status: 401 });
  }
  const url = new URL('/login', req.nextUrl);
  if (pathname !== '/') url.searchParams.set('from', pathname);
  return NextResponse.redirect(url);
});

// Run on everything except Next internals and image assets (so /sketch_screens.html
// and /api/* are guarded).
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|ico|webp)$).*)'],
};
