import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { authConfig } from './auth.config';

// Safe phone → +7XXXXXXXXXX (returns null for non-phone input, never throws).
function toPhone(raw: string): string | null {
  const d = raw.replace(/\D/g, '');
  if (d.length === 10) return '+7' + d;
  if (d.length === 11 && (d[0] === '7' || d[0] === '8')) return '+7' + d.slice(1);
  return null;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      // `login` accepts a phone number OR an email.
      credentials: {
        login: { label: 'Телефон или email', type: 'text' },
        password: { label: 'Пароль', type: 'password' },
        remember: { label: 'Запомнить меня', type: 'checkbox' },
      },
      async authorize(credentials) {
        const login = String(credentials?.login ?? '').trim();
        const password = String(credentials?.password ?? '');
        if (!login || !password) return null;

        // Try phone first (if it looks like one), then email.
        const phone = toPhone(login);
        let user;
        if (phone) {
          [user] = await db.select().from(users).where(eq(users.phone, phone)).limit(1);
        }
        if (!user) {
          [user] = await db.select().from(users).where(eq(users.email, login.toLowerCase())).limit(1);
        }
        if (!user || !user.passwordHash) return null;
        if (!user.isActive) return null;                    // deactivated users cannot sign in
        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        await db.update(users).set({ lastLogin: new Date() }).where(eq(users.id, user.id));  // best-effort
        return {
          id: user.id, email: user.email, name: user.name, role: user.role,
          remember: credentials?.remember === 'true' || credentials?.remember === true,
        };
      },
    }),
  ],
});
