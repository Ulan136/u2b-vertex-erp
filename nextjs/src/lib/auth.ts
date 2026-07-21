import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { authConfig } from './auth.config';
import { rateLimit, clientIp } from '@/server/lib/rateLimit';
import { logLogin } from '@/server/lib/audit';

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
      async authorize(credentials, request) {
        const login = String(credentials?.login ?? '').trim();
        const password = String(credentials?.password ?? '').trim();   // tolerate copy-paste whitespace
        if (!login || !password) return null;

        // Антибрутфорс: не больше 6 попыток/мин на связку логин+IP и 30/мин на IP.
        const ip = clientIp((request as Request | undefined)?.headers ?? new Headers());
        if (!rateLimit(`login:acct:${login.toLowerCase()}:${ip}`, 6, 60_000).ok) return null;
        if (!rateLimit(`login:ip:${ip}`, 30, 60_000).ok) return null;

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
        await logLogin({ id: user.id, name: user.name }, ip);                                 // журнал входов (кто/когда/IP)
        return {
          id: user.id, email: user.email, name: user.name, role: user.role,
          remember: credentials?.remember === 'true' || credentials?.remember === true,
        };
      },
    }),
  ],
});
