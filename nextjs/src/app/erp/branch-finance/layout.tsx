import type { Metadata } from 'next';

// Отдельный PWA для кабинета филиала: ставится как своё приложение «Филиал»
// (start_url → /erp/branch-finance). Переопределяет manifest корневого ERP для
// этой ветки. Scope /erp — навигация по Заявкам/Сертификатам остаётся в приложении.
export const metadata: Metadata = {
  manifest: '/branch.webmanifest',
  applicationName: 'Кабинет филиала',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Филиал' },
};

export default function BranchCabinetLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
