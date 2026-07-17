import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { currentUser } from '@/server/lib/session';
import { landingPath } from '@/server/lib/landing';
import { isMobileUA } from '@/server/lib/device';

// Root: no session → real /login; with session → the role's landing screen.
//   master → /master, director → /director (телефон) либо ERP (десктоп),
//   остальные → ERP-оболочка. Middleware также защищает эти маршруты.
export default async function Home() {
  const user = await currentUser();
  if (!user) redirect('/login');
  const mobile = isMobileUA(headers().get('user-agent'));
  redirect(landingPath(user.role, mobile));
}
