// Pure landing/redirect resolvers (no imports) — kept dependency-free so the
// role→screen routing is unit tested without booting Next/auth.

// Куда отправить сразу после логина (устройство-независимо; мобильный
// редирект в кабинет навешивает middleware при КАЖДОМ заходе).
//   master → всегда свой кабинет; остальные → новый ERP (/erp). Старый интерфейс
//   (/sketch_screens.html) остаётся доступным как fallback по прямой ссылке.
export function postLoginPath(role?: string | null): '/master' | '/erp' {
  return role === 'master' ? '/master' : '/erp';
}

// Нужно ли увести пользователя с ERP-страницы в его мобильный кабинет.
// Срабатывает при ЛЮБОМ заходе с телефона в корень/ERP:
//   - мастер с телефона → /master;
//   - директор с телефона → /director, если он сам не выбрал «Полная версия ERP»
//     (fullErp — флаг из cookie, живёт до возврата в кабинет).
// Возвращает путь редиректа или null (оставить на ERP).
export function mobileCabinetRedirect(opts: {
  role?: string | null;
  mobile: boolean;
  fullErp: boolean;
}): '/master' | '/director' | null {
  if (!opts.mobile) return null;
  if (opts.role === 'master') return '/master';
  if (opts.role === 'director' && !opts.fullErp) return '/director';
  return null;
}
