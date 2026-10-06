// VAPID-ключи для Web Push. Публичный ключ НЕ секретный (уходит в браузеры) —
// держим в коде как дефолт; приватный — ТОЛЬКО через env (VAPID_PRIVATE_KEY на Vercel).
// Без приватного ключа отправка пуша просто не делается (кабинет работает как раньше).
export const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY
  || 'BIRi2VKAdgP9YrmBsmyx4Q7hPa94D3hQ2o1LFzPo9PWIi1gy5G4N2TNwuJEvagpNaE5fmabP-d4WOtU3JBXEdeE';
export const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
export const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:ul19.88ibon2009@gmail.com';
export const pushConfigured = (): boolean => !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
