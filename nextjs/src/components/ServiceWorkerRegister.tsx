'use client';

import { useEffect } from 'react';

// Registers the PWA service worker once, after load. Rendered in the root layout
// so it covers the ERP shell and the client cabinets alike.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const onLoad = () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('[pwa] SW registration failed:', err?.message ?? err);
      });
    };
    if (document.readyState === 'complete') onLoad();
    else window.addEventListener('load', onLoad, { once: true });
    return () => window.removeEventListener('load', onLoad);
  }, []);
  return null;
}
