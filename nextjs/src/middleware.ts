import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import { authConfig } from '@/lib/auth.config';
import { isCabinetPublicApi } from '@/server/lib/apiAccess';

const { auth } = NextAuth(authConfig);

// Without a session only these are reachable:
//   - /login, the client cabinets (/cabinet, /cabinet/tec) and next-auth routes,
//   - the cabinet's public API ops (submit order + cabinet URL).
// Everything else (the ERP app, all other /api/v2/*) requires a login.
export default auth((req) => {
  const { pathname } = req.nextUrl;
  const loggedIn = !!req.auth?.user;

  const publicPage =
    pathname === '/login' ||
    pathname === '/cabinet' || pathname.startsWith('/cabinet/') ||
    pathname.startsWith('/api/auth');

  if (publicPage) return NextResponse.next();
  if (isCabinetPublicApi(req.method, pathname)) return NextResponse.next();
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
