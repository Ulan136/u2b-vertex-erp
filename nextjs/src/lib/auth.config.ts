import type { NextAuthConfig } from 'next-auth';

// Edge-safe config (no DB, no bcrypt) — shared by middleware and the full auth.
// Providers are added only in auth.ts (Node runtime). Middleware just decodes
// the JWT to know who is logged in.
export const authConfig: NextAuthConfig = {
  trustHost: true,
  pages: { signIn: '/login' },
  session: { strategy: 'jwt' },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = (user as { role?: string }).role;
        token.uid = (user as { id?: string }).id;
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
