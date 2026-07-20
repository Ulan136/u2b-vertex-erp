import { redirect } from 'next/navigation';
import { currentUser } from '@/server/lib/session';
import { permissionsRepo } from '@/server/repositories/permissions.repo';
import { isScreenAllowed, ROLE_LABELS_RU, type Role } from '@/server/dto/permissions.dto';
import { ERP_NAV } from '@/lib/erp-nav';
import ErpShell from '@/components/erp/ErpShell';
import './erp.css';

// Серверный шелл: сессия + матрица прав → навигация только по разрешённым экранам.
export default async function ErpLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect('/login?from=/erp');

  const perms = await permissionsRepo.list();
  const sections = ERP_NAV
    .map(s => ({ ...s, items: s.items.filter(i => isScreenAllowed(user.role, i.screenKey, perms)) }))
    .filter(s => s.items.length > 0);

  return (
    <ErpShell
      user={{ name: user.name, role: user.role, roleLabel: ROLE_LABELS_RU[user.role as Role] || user.role }}
      sections={sections}
    >
      {children}
    </ErpShell>
  );
}
