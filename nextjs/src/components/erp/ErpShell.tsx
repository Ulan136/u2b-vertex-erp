'use client';
import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { NavSection } from '@/lib/erp-nav';
import { ZONE_LABELS } from '@/lib/erp-nav';
import { useApi } from '@/lib/api';
import HistoryPanel from '@/components/erp/HistoryPanel';
import { ROLE_LABELS_RU, type Role } from '@/server/dto/permissions.dto';

function Bell() {
  const { data } = useApi<{ unread: number }>('/api/v2/notifications', { refreshInterval: 60000 });
  const unread = data?.unread || 0;
  return (
    <Link href="/erp/notifications" className="erp-bell" title="Уведомления">
      🔔{unread > 0 && <span className="erp-bell-badge">{unread > 9 ? '9+' : unread}</span>}
    </Link>
  );
}

type PresenceUser = { id: string; name: string; role: string; lastSeenAt: string | null; online: boolean };
const roleRu = (r: string) => ROLE_LABELS_RU[r as Role] || r;
function lastSeen(ts: string | null): string {
  if (!ts) return 'не заходил';
  const diff = Date.now() - new Date(ts).getTime();
  if (!Number.isFinite(diff)) return '';
  const m = Math.floor(diff / 60000);
  if (m < 60) return `был ${m} мин назад`;
  const h = Math.floor(m / 60);
  if (h < 24) return `был ${h} ч назад`;
  return `был ${Math.floor(h / 24)} дн назад`;
}

function Presence() {
  const { data } = useApi<{ onlineCount: number; users: PresenceUser[] }>('/api/v2/presence', { refreshInterval: 30000 });
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, [open]);
  const users = data?.users || [];
  const count = data?.onlineCount || 0;
  return (
    <div className="erp-presence" ref={ref}>
      <button className="erp-presence-btn" title="Кто онлайн" onClick={e => { e.stopPropagation(); setOpen(v => !v); }}>
        🟢 <span className="erp-presence-lbl">Онлайн: </span>{count}
      </button>
      {open && (
        <div className="erp-presence-panel">
          <div className="erp-presence-head">🟢 Онлайн: {count}</div>
          {users.length === 0 ? <div className="erp-presence-empty">Нет сотрудников</div> : users.map(u => (
            <div key={u.id} className={`erp-presence-row${u.online ? '' : ' off'}`}>
              <span className="erp-presence-dot" />
              <div>
                <div className="erp-presence-name">{u.name}</div>
                <div className="erp-presence-sub">{roleRu(u.role)}{u.online ? '' : ` · ${lastSeen(u.lastSeenAt)}`}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type ShellUser = { name: string; role: string; roleLabel: string };

export default function ErpShell({ user, sections, children }: { user: ShellUser; sections: NavSection[]; children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [histOpen, setHistOpen] = React.useState(false);

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
          {sections.map((section, si) => {
          const prevZone = si > 0 ? sections[si - 1].zone : undefined;
          const showZoneHead = section.zone && section.zone !== prevZone;
          return (
            <React.Fragment key={section.title}>
            {showZoneHead && (
              <div className={`erp-zone-head erp-zone-head-${section.zone}`}>
                <span>{ZONE_LABELS[section.zone!]}</span><span className="erp-zh-line" />
              </div>
            )}
            <div className={`erp-nav-section${section.zone ? ' erp-zone-' + section.zone : ''}`}>
              <div className="erp-nav-title"><span>{section.icon}</span>{section.title}</div>
              {section.items.map((item, i) => {
                const isActive = !item.legacy && !item.external && item.href === pathname;
                if (item.external) {
                  return (
                    <a key={item.label + i} href={item.href} className="erp-nav-item erp-nav-cab" onClick={() => setMobileOpen(false)}>
                      {item.label}
                      <span className="erp-nav-legacy" title="Мобильный кабинет">↗</span>
                    </a>
                  );
                }
                return (
                  <Link
                    key={item.label + i}
                    href={item.href}
                    className={`erp-nav-item${isActive ? ' active' : ''}`}
                    onClick={() => setMobileOpen(false)}
                  >
                    {item.label}
                    {item.legacy && <span className="erp-nav-legacy" title="Пока в старом интерфейсе">↗</span>}
                  </Link>
                );
              })}
            </div>
            </React.Fragment>
          );
          })}
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
            <Presence />
            <button className="erp-bell" title="История" onClick={() => setHistOpen(true)}>🕘</button>
            <Bell />
            <a href="/sketch_screens.html" className="erp-legacy-link">Старый интерфейс</a>
          </div>
        </header>
        <main className="erp-content">{children}</main>
      </div>
      <HistoryPanel open={histOpen} onClose={() => setHistOpen(false)} />
    </div>
  );
}
