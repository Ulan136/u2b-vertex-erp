import { redirect } from 'next/navigation';
import { currentUser } from '@/server/lib/session';
import { postLoginPath } from '@/server/lib/landing';

// Root: no session → /login. С сессией → master в свой кабинет, остальные в ERP.
// Мобильный редирект директора/мастера в кабинет при ЛЮБОМ заходе делает
// middleware (учитывает выбор «Полная версия ERP»).
export default async function Home() {
  const user = await currentUser();
  if (!user) redirect('/login');
  redirect(postLoginPath(user.role));
}
