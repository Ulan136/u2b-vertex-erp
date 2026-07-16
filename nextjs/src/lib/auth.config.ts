import type { NextAuthConfig } from 'next-auth';

// Edge-safe config (no DB, no bcrypt) — shared by middleware and the full auth.
// Providers are added only in auth.ts (Node runtime). Middleware just decodes
// the JWT to know who is logged in.
const REMEMBER_DAYS = 30;      // «Запомнить меня» → persistent session
const SESSION_HOURS = 12;      // без «Запомнить меня» → короткая сессия

export const authConfig: NextAuthConfig = {
  trustHost: true,
  pages: { signIn: '/login' },
  session: { strategy: 'jwt', maxAge: REMEMBER_DAYS * 24 * 60 * 60 },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = (user as { role?: string }).role;
        token.uid = (user as { id?: string }).id;
        token.remember = (user as { remember?: boolean }).remember ? 1 : 0;
      }
      // Without «Запомнить меня» cap the token lifetime to a short rolling window.
      if (token.remember === 0) {
        const short = Math.floor(Date.now() / 1000) + SESSION_HOURS * 60 * 60;
        if (typeof token.exp !== 'number' || token.exp > short) token.exp = short;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        (session.user as { role?: unknown }).role = token.role;
        (session.user as { id?: unknown }).id = token.uid;
      }
      return session;
    },
  },
};
