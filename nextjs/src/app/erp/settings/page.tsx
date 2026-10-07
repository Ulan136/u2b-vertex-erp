'use client';
import { useState } from 'react';
import Link from 'next/link';
import { PageTitle } from '@/components/ui';
import { useApi } from '@/lib/api';

const CARDS = [
  { href: '/erp/settings/org', icon: '🏢', label: 'Организация', sub: 'реквизиты, печать, подпись' },
  { href: '/erp/settings/users', icon: '👥', label: 'Пользователи', sub: 'учётные записи и роли' },
  { href: '/erp/settings/passwords', icon: '🔑', label: 'Управление паролями', sub: 'сброс паролей сотрудников', adminOnly: true },
  { href: '/erp/access', icon: '🔐', label: 'Доступы', sub: 'права ролей к разделам' },
  { href: '/erp/settings/branches', icon: '🏬', label: 'Филиалы', sub: 'список филиалов' },
  { href: '/erp/clients', icon: '👤', label: 'Клиенты', sub: 'справочник клиентов' },
];

// Прямые ссылки на кабинеты — передать нужному сотруднику, чтобы он заходил
// строго в свой кабинет (а не «гулял» по чужим разделам).
const CABINETS = [
  { href: '/master', icon: '📱', label: 'Кабинет мастера', sub: 'выездной мастер: заявки, счётчики, фото' },
  { href: '/erp/branch-finance?branch=astana', icon: '🏢', label: 'Кабинет филиала · Астана', sub: 'менеджер Астаны: финансы, заявки, серт, база' },
  { href: '/erp/branch-finance?branch=almaty', icon: '🏢', label: 'Кабинет филиала · Алматы', sub: 'менеджер Алматы: финансы, заявки, серт, база' },
  { href: '/director', icon: '👔', label: 'Кабинет директора', sub: 'сводка и контроль' },
];

export default function SettingsHub() {
  const { data: session } = useApi<{ user?: { role?: string } }>('/api/auth/session');
  const isAdmin = session?.user?.role === 'admin';
  const cards = CARDS.filter(c => !c.adminOnly || isAdmin);
  return (
    <div>
      <PageTitle title="Настройки" sub="Организация, пользователи, права, справочники" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
        {cards.map(c => (
          <Link key={c.href} href={c.href} className="ui-card" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
            <div style={{ fontSize: 26 }}>{c.icon}</div>
            <div style={{ fontWeight: 700, marginTop: 6 }}>{c.label}</div>
            <div className="erp-muted" style={{ fontSize: 12 }}>{c.sub}</div>
          </Link>
        ))}
      </div>

      <div style={{ marginTop: 24, fontWeight: 800, fontSize: 15 }}>🔗 Кабинеты — прямые ссылки</div>
      <div className="erp-muted" style={{ fontSize: 12, marginBottom: 10 }}>Передайте сотруднику ссылку на его кабинет, чтобы он заходил строго в свой раздел.</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
        {CABINETS.map(c => (
          <div key={c.href} className="ui-card" style={{ display: 'block' }}>
            <Link href={c.href} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
              <div style={{ fontSize: 26 }}>{c.icon}</div>
              <div style={{ fontWeight: 700, marginTop: 6 }}>{c.label}</div>
              <div className="erp-muted" style={{ fontSize: 12 }}>{c.sub}</div>
            </Link>
            <CopyLink path={c.href} />
          </div>
        ))}
      </div>
    </div>
  );
}

// Маленькая кнопка «Копировать ссылку» (полный URL сайта + путь) — чтобы переслать сотруднику.
function CopyLink({ path }: { path: string }) {
  const [done, setDone] = useState(false);
  const copy = () => {
    const url = (typeof window !== 'undefined' ? window.location.origin : '') + path;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }).catch(() => {});
    }
  };
  return (
    <button onClick={copy} className="ui-btn ui-btn-outline" style={{ marginTop: 8, fontSize: 12, padding: '4px 10px' }}>{done ? '✅ Скопировано' : '📋 Копировать ссылку'}</button>
  );
}
