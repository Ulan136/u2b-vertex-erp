'use client';
import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { NavSection } from '@/lib/erp-nav';
import { useApi } from '@/lib/api';

function Bell() {
  const { data } = useApi<{ unread: number }>('/api/v2/notifications', { refreshInterval: 60000 });
  const unread = data?.unread || 0;
  return (
    <Link href="/erp/notifications" className="erp-bell" title="Уведомления">
      🔔{unread > 0 && <span className="erp-bell-badge">{unread > 9 ? '9+' : unread}</span>}
    </Link>
  );
}

type ShellUser = { name: string; role: string; roleLabel: string };

export default function ErpShell({ user, sections, children }: { user: ShellUser; sections: NavSection[]; children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  // Заголовок страницы = активный пункт навигации (для не-legacy маршрутов).
  const active = sections.flatMap(s => s.items).find(i => !i.legacy && i.href === pathname);

  return (
    <div className="erp-root">
      <aside className={`erp-sidebar${mobileOpen ? ' open' : ''}`}>
        <div className="erp-brand">
          <span className="erp-brand-logo">V</span>
          <div>
            <div className="erp-brand-name">VERTEX ERP</div>
            <div className="erp-brand-sub">VERTEX METROLOGY</div>
          </div>
        </div>
        <nav className="erp-nav">
          {sections.map(section => (
            <div className="erp-nav-section" key={section.title}>
              <div className="erp-nav-title"><span>{section.icon}</span>{section.title}</div>
              {section.items.map((item, i) => {
                const isActive = !item.legacy && item.href === pathname;
                return (
                  <Link
                    key={item.label + i}
                    href={item.href}
                    className={`erp-nav-item${isActive ? ' active' : ''}`}
                    onClick={() => setMobileOpen(false)}
                    {...(item.legacy ? {} : {})}
                  >
                    {item.label}
                    {item.legacy && <span className="erp-nav-legacy" title="Пока в старом интерфейсе">↗</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="erp-sidebar-foot">
          <div className="erp-user">
            <div className="erp-user-name">{user.name || '—'}</div>
            <div className="erp-user-role">{user.roleLabel}</div>
          </div>
          <a href="/logout" className="erp-logout" title="Выйти">⎋</a>
        </div>
      </aside>

      {mobileOpen && <div className="erp-overlay" onClick={() => setMobileOpen(false)} />}

      <div className="erp-main">
        <header className="erp-header">
          <button className="erp-burger" onClick={() => setMobileOpen(v => !v)} aria-label="Меню">☰</button>
          <div className="erp-header-title">{active ? active.label : 'Рабочий стол'}</div>
          <div className="erp-header-right">
            <Bell />
            <a href="/sketch_screens.html" className="erp-legacy-link">Старый интерфейс</a>
          </div>
        </header>
        <main className="erp-content">{children}</main>
      </div>
    </div>
  );
}
