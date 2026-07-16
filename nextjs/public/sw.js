// U2B-SuTrack service worker.
// Strategy: cache only the app shell + static assets. API responses are NEVER
// cached (network-only) so managers never see stale orders / stock.
const CACHE = 'sutrack-v1';
const SHELL = ['/', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'];
const APP_URL = '/sketch_screens.html'; // экран заявок (куда ведёт клик по пушу)

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                       // мутации не трогаем
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;        // сторонние — как есть
  if (url.pathname.startsWith('/api/')) return;           // API — network-only, НЕ кэшируем

  // Оболочка и статика: network-first, оффлайн — из кэша.
  e.respondWith((async () => {
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.ok) {
        const copy = fresh.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return fresh;
    } catch {
      const cached = await caches.match(req);
      if (cached) return cached;
      if (req.mode === 'navigate') {
        const shell = await caches.match('/');
        if (shell) return shell;
      }
      throw new Error('offline: not cached');
    }
  })());
});

// ── Push-уведомления ───────────────────────────────────────────────
self.addEventListener('push', (e) => {
  const data = (() => { try { return e.data ? e.data.json() : {}; } catch { return {}; } })();
  const title = data.title || '🔔 U2B-SuTrack';
  const body = data.body || 'Новое событие';
  const url = data.url || APP_URL;
  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      vibrate: [200, 100, 200],
      data: { url },
      actions: [
        { action: 'view', title: '👁 Открыть' },
        { action: 'close', title: '✕ Закрыть' },
      ],
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  if (e.action === 'close') return;
  const target = (e.notification.data && e.notification.data.url) || APP_URL;
  e.waitUntil((async () => {
    const cs = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of cs) {
      if ('focus' in c) { await c.focus(); if ('navigate' in c) { try { await c.navigate(target); } catch {} } return; }
    }
    await clients.openWindow(target);
  })());
});
