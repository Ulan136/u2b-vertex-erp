import { auth } from '@/lib/auth';

export type SessionUser = { id: string; role: string; name: string; email: string };

// Resolve the logged-in user from the session (JWT). Null when not signed in.
export async function currentUser(): Promise<SessionUser | null> {
  const session = await auth();
  const u = session?.user as { id?: string; role?: string; name?: string; email?: string } | undefined;
  if (!u?.id) return null;
  return { id: u.id, role: u.role || 'manager', name: u.name || '', email: u.email || '' };
}
