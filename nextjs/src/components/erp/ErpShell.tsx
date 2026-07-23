'use client';
import * as React from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
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
  const search = useSearchParams();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [histOpen, setHistOpen] = React.useState(false);
  const [navQ, setNavQ] = React.useState('');

  // Активен, если совпадает путь и все query-параметры ссылки (source/type/section).
  const itemActive = React.useCallback((href?: string) => {
    if (!href) return false;
    const [p, qs] = href.split('?');
    if (p !== pathname) return false;
    if (!qs) return search.toString() === '';
    const q = new URLSearchParams(qs);
    let ok = true;
    q.forEach((v, k) => { if (search.get(k) !== v) ok = false; });
    return ok;
  }, [pathname, search]);

  // Заголовок страницы = активный пункт навигации (для не-legacy маршрутов).
  const active = sections.flatMap(s => s.items).find(i => !i.legacy && !i.heading && itemActive(i.href));

  // Рендер одного пункта (используется и в полном списке, и в поиске).
  const renderItem = (item: NavSection['items'][number], i: number) => {
    if (item.external) {
      return (
        <a key={item.label + i} href={item.href} className="erp-nav-item erp-nav-cab" onClick={() => setMobileOpen(false)}>
          {item.label}<span className="erp-nav-legacy" title="Мобильный кабинет">↗</span>
        </a>
      );
    }
    const isActive = !item.legacy && itemActive(item.href);
    return (
      <Link key={item.label + i} href={item.href ?? '#'} className={`erp-nav-item${isActive ? ' active' : ''}`} onClick={() => setMobileOpen(false)}>
        {item.label}{item.legacy && <span className="erp-nav-legacy" title="Пока в старом интерфейсе">↗</span>}
      </Link>
    );
  };

  // Поиск по меню: фильтр пунктов (без заголовков-источников), только секции с совпадениями.
  const q = navQ.trim().toLowerCase();
  const filtered = q
    ? sections.map(s => ({ s, items: s.items.filter(i => !i.heading && i.label.toLowerCase().includes(q)) })).filter(x => x.items.length > 0)
    : null;

  return (
    <div className="erp-root">
      <aside className={`erp-sidebar${mobileOpen ? ' open' : ''}`}>
        <div className="erp-brand">
          <span className="erp-brand-logo">V</span>
          <div>
            <div className="erp-brand-name">U2B ERP</div>
            <div className="erp-brand-sub">VERTEX METROLOGY</div>
          </div>
        </div>
        <div className="erp-nav-search">
          <input value={navQ} onChange={e => setNavQ(e.target.value)} placeholder="🔍 Поиск по меню…" />
          {navQ && <button onClick={() => setNavQ('')} aria-label="Очистить">✕</button>}
        </div>
        <nav className="erp-nav">
          {filtered ? (
            filtered.length === 0
              ? <div className="erp-nav-empty">Ничего не найдено</div>
              : filtered.map(({ s, items }) => (
                <div key={s.title} className={`erp-nav-section${s.zone ? ' erp-zone-' + s.zone : ''}`}>
                  <div className="erp-nav-title"><span>{s.icon}</span>{s.title}</div>
                  {items.map((item, i) => renderItem(item, i))}
                </div>
              ))
          ) : sections.map((section, si) => {
          const prevZone = si > 0 ? sections[si - 1].zone : undefined;
          const showZoneHead = section.zone && section.zone !== prevZone;
          return (
            <React.Fragment key={section.title}>
            {showZoneHead && (
              <div className={`erp-zone-head erp-zone-head-${section.zone}`}>
                <span>{ZONE_LABELS[section.zone!]}</span><span className="erp-zh-line" />
              </div>
            )}
            {section.divider && <div className={`erp-nav-divider${section.zone ? ' erp-zone-' + section.zone : ''}`}>{section.divider}</div>}
            <div className={`erp-nav-section${section.zone ? ' erp-zone-' + section.zone : ''}`}>
              <div className="erp-nav-title"><span>{section.icon}</span>{section.title}</div>
              {section.items.map((item, i) => item.heading
                ? <div key={item.label + i} className="erp-nav-subhead">{item.label}</div>
                : renderItem(item, i))}
            </div>
            </React.Fragment>
          );
          })}
        </nav>
        <div className="erp-sidebar-foot">
          <span className="erp-avatar">{(user.name || '?').trim().charAt(0).toUpperCase() || '?'}</span>
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
