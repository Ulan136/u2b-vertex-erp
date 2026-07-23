'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, useApi } from '@/lib/api';
import { entityMeta, actionRu, AUDIT_ALL_ROLES, AUDIT_LOGIN_ROLES } from '@/server/dto/audit.dto';
import { formatDate } from '@/lib/format';

type Row = { id: string; userName?: string | null; action: string; entityType?: string | null; entityId?: string | null; entityLabel?: string | null; ip?: string | null; createdAt: string };

const two = (n: number) => String(n).padStart(2, '0');
const hm = (d: Date) => `${two(d.getHours())}:${two(d.getMinutes())}`;
function dayKey(s: string) { const d = new Date(s); const t = new Date(); const y = new Date(t); y.setDate(t.getDate() - 1); const same = (a: Date, b: Date) => a.toDateString() === b.toDateString(); if (same(d, t)) return 'Сегодня'; if (same(d, y)) return 'Вчера'; return formatDate(s); }

export default function HistoryPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: session } = useApi<{ user?: { role?: string } }>('/api/auth/session');
  const role = session?.user?.role || '';
  const canAll = AUDIT_ALL_ROLES.includes(role);
  const canLogins = AUDIT_LOGIN_ROLES.includes(role);
  const router = useRouter();

  const [scope, setScope] = React.useState('mine');
  const [q, setQ] = React.useState('');
  const [items, setItems] = React.useState<Row[]>([]);
  const [hasMore, setHasMore] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const offset = React.useRef(0);

  const fetchPage = React.useCallback(async (reset: boolean, sc = scope, query = q) => {
    setLoading(true);
    const off = reset ? 0 : offset.current;
    try {
      const r = await apiFetch<{ items: Row[]; hasMore: boolean }>(`/api/v2/audit?scope=${sc}&q=${encodeURIComponent(query)}&limit=40&offset=${off}`);
      offset.current = off + r.items.length;
      setItems(prev => reset ? r.items : [...prev, ...r.items]);
      setHasMore(r.hasMore);
    } catch { setHasMore(false); } finally { setLoading(false); }
  }, [scope, q]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useEffect(() => { if (open) fetchPage(true, scope, q); }, [open, scope]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useEffect(() => { if (!open) return; const t = setTimeout(() => fetchPage(true, scope, q), 300); return () => clearTimeout(t); }, [q]);

  function goto(r: Row) { const m = entityMeta(r.entityType); if (m.route) { router.push(m.route); onClose(); } }

  // группировка по дням (порядок сохраняется — items уже отсортированы desc)
  const groups: Array<{ day: string; rows: Row[] }> = [];
  for (const r of items) { const k = dayKey(r.createdAt); const g = groups[groups.length - 1]; if (g && g.day === k) g.rows.push(r); else groups.push({ day: k, rows: [r] }); }

  if (!open) return null;
  return (
    <>
      <div className="erp-hist-overlay" onClick={onClose} />
      <aside className="erp-hist">
        <div className="erp-hist-head">
          <div className="erp-hist-title">🕘 История</div>
          <button className="erp-hist-x" onClick={onClose} aria-label="Закрыть">✕</button>
        </div>
        <div className="erp-hist-tabs">
          <button className={`erp-hist-tab${scope === 'mine' ? ' on' : ''}`} onClick={() => setScope('mine')}>Мои</button>
          {canAll && <button className={`erp-hist-tab${scope === 'all' ? ' on' : ''}`} onClick={() => setScope('all')}>Все сотрудники</button>}
          {canLogins && <button className={`erp-hist-tab${scope === 'logins' ? ' on' : ''}`} onClick={() => setScope('logins')}>Входы</button>}
        </div>
        <div className="erp-hist-search"><input placeholder="🔍 Поиск по ленте…" value={q} onChange={e => setQ(e.target.value)} /></div>
        <div className="erp-hist-note">Лог ведётся с момента запуска — прошлые действия не восстановимы.</div>
        <div className="erp-hist-feed">
          {items.length === 0 && !loading && <div className="erp-hist-empty">Записей нет.</div>}
          {groups.map(g => (
            <div key={g.day}>
              <div className="erp-hist-day">{g.day}</div>
              {g.rows.map(r => {
                const m = entityMeta(r.entityType);
                const isLogin = r.action === 'login';
                return (
                  <button key={r.id} className="erp-hist-row" onClick={() => !isLogin && goto(r)} style={isLogin ? { cursor: 'default' } : undefined}>
                    <span className="erp-hist-ico">{isLogin ? '🔑' : m.icon}</span>
                    <span className="erp-hist-main">
                      <span className="erp-hist-text">
                        {isLogin ? <>Вход в систему{r.ip ? ` · ${r.ip}` : ''}</> : <>{m.ru} {r.entityLabel ? <b>{r.entityLabel}</b> : ''} — {actionRu(r.action)}</>}
                      </span>
                      <span className="erp-hist-sub">{r.userName || '—'} · {hm(new Date(r.createdAt))}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
          {hasMore && <button className="erp-hist-more" onClick={() => fetchPage(false)} disabled={loading}>{loading ? 'Загрузка…' : 'Показать ещё'}</button>}
        </div>
      </aside>
    </>
  );
}
