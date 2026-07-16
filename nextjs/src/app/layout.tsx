import './globals.css';
import type { Metadata, Viewport } from 'next';
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister';

export const metadata: Metadata = {
  title: 'U2B-SuTrack',
  description: 'Vertex Metrology — управление поверкой и заказами',
  manifest: '/manifest.json',
  applicationName: 'U2B-SuTrack',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'SuTrack',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#1b2a4a',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
