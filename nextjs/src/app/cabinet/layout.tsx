import type { Metadata } from 'next';

// External client cabinets install as their OWN app «Заявка на поверку»
// (separate manifest / start_url), not the whole ERP. Applies to /cabinet and,
// unless overridden, /cabinet/tec.
export const metadata: Metadata = {
  title: 'Заявка на поверку',
  applicationName: 'Заявка на поверку',
  manifest: '/cabinet.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Поверка',
  },
};

export default function CabinetLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
