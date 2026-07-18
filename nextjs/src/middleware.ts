import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import { authConfig } from '@/lib/auth.config';
import { isCabinetPublicApi } from '@/server/lib/apiAccess';
import { isMobileUA } from '@/server/lib/device';
import { mobileCabinetRedirect } from '@/server/lib/landing';

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

  // PWA assets must be fetchable without a session — a manifest/SW that 307s to
  // /login is treated as invalid by the browser and kills the install prompt.
  const publicAsset =
    pathname === '/manifest.json' ||
    pathname === '/sw.js' ||
    pathname.endsWith('.webmanifest') ||
    pathname.startsWith('/icons/');

  const publicPage =
    pathname === '/login' ||
    pathname === '/cabinet' || pathname.startsWith('/cabinet/') ||
    pathname.startsWith('/api/auth');

  if (publicAsset || publicPage) return NextResponse.next();
  if (isCabinetPublicApi(req.method, pathname)) return NextResponse.next();

  // Мобильные кабинеты — доступ по роли (+ Админ). Пути и их rewrite-цели
  // (/mobile_*.html) защищаем одинаково. Не тот, кто вошёл → «Нет доступа».
  const isMasterCab = pathname === '/master' || pathname === '/mobile_master.html';
  const isDirectorCab = pathname === '/director' || pathname === '/mobile_director.html';
  if (isMasterCab || isDirectorCab) {
    if (!loggedIn) {
      const url = new URL('/login', req.nextUrl);
      url.searchParams.set('from', isMasterCab ? '/master' : '/director');
      return NextResponse.redirect(url);
    }
    const allowed = isMasterCab
      ? (role === 'master' || role === 'admin')
      : (role === 'director' || role === 'admin');
    if (!allowed) return NextResponse.rewrite(new URL('/no_access.html', req.nextUrl));
    return NextResponse.next();
  }

  // Мобильный редирект в свой кабинет при ЛЮБОМ заходе с телефона на ERP:
  // мастер → /master; директор → /director, пока сам не выбрал «Полная версия ERP»
  // (флаг в cookie erp_full, сбрасывается при возврате в кабинет).
  if (loggedIn && (pathname === '/' || pathname === '/sketch_screens.html')) {
    const dest = mobileCabinetRedirect({
      role,
      mobile: isMobileUA(req.headers.get('user-agent')),
      fullErp: req.cookies.get('erp_full')?.value === '1',
    });
    if (dest) return NextResponse.redirect(new URL(dest, req.nextUrl));
  }

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
