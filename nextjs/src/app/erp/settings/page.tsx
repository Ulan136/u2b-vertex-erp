import Link from 'next/link';
import { PageTitle } from '@/components/ui';

const CARDS = [
  { href: '/erp/settings/org', icon: '🏢', label: 'Организация', sub: 'реквизиты, печать, подпись' },
  { href: '/erp/settings/users', icon: '👥', label: 'Пользователи', sub: 'учётные записи и роли' },
  { href: '/erp/access', icon: '🔐', label: 'Доступы', sub: 'права ролей к разделам' },
  { href: '/erp/settings/branches', icon: '🏬', label: 'Филиалы', sub: 'список филиалов' },
  { href: '/erp/clients', icon: '👤', label: 'Клиенты', sub: 'справочник клиентов' },
];

export default function SettingsHub() {
  return (
    <div>
      <PageTitle title="Настройки" sub="Организация, пользователи, права, справочники" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
        {CARDS.map(c => (
          <Link key={c.href} href={c.href} className="ui-card" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
            <div style={{ fontSize: 26 }}>{c.icon}</div>
            <div style={{ fontWeight: 700, marginTop: 6 }}>{c.label}</div>
            <div className="erp-muted" style={{ fontSize: 12 }}>{c.sub}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
