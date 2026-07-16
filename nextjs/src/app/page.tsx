import { redirect } from 'next/navigation';
import { currentUser } from '@/server/lib/session';

// Root: no session → real /login; with session → the ERP shell, which lands on
// the role's start screen (via /api/v2/me). Middleware also guards this, this is
// the explicit in-page routing.
export default async function Home() {
  const user = await currentUser();
  if (!user) redirect('/login');
  redirect('/sketch_screens.html');
}
