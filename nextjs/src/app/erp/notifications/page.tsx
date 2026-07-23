'use client';
import { useApi, apiSend } from '@/lib/api';
import { toast } from '@/lib/toast';
import { Card, Button, PageTitle, EmptyRow } from '@/components/ui';
import { formatDateTime } from '@/lib/format';

type Notif = { id: string; type: string; title: string; link?: string | null; isRead: boolean; createdAt?: string | null };
const dt = (d?: string | null) => formatDateTime(d);

export default function NotificationsPage() {
  const { data, error, isLoading, mutate } = useApi<{ unread: number; items: Notif[] }>('/api/v2/notifications');
  const items = data?.items || [];

  async function read(n: Notif) { if (n.isRead) return; try { await apiSend(`/api/v2/notifications/${n.id}/read`, 'POST'); await mutate(); } catch { /* */ } }
  async function readAll() { try { await apiSend('/api/v2/notifications/read-all', 'POST'); await mutate(); toast('✅ Все прочитаны'); } catch (e) { toast('⚠️ ' + (e as Error).message); } }

  return (
    <div>
      <PageTitle title="Уведомления" sub={data?.unread ? `Непрочитанных: ${data.unread}` : 'Все прочитаны'} action={data?.unread ? <Button variant="outline" onClick={readAll}>Прочитать все</Button> : undefined} />
      <Card style={{ padding: 0 }}>
        {error ? <EmptyRow>Нет доступа.</EmptyRow> : isLoading ? <EmptyRow>Загрузка…</EmptyRow> : items.length === 0 ? <EmptyRow>Уведомлений нет.</EmptyRow> : (
          <div>
            {items.map(n => (
              <div key={n.id} onClick={() => read(n)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid #f1f5f9', cursor: n.isRead ? 'default' : 'pointer', background: n.isRead ? '#fff' : '#eff6ff' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: n.isRead ? '#cbd5e1' : '#1a56db', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: n.isRead ? 400 : 600, fontSize: 13 }}>{n.title}</div>
                  <div className="erp-muted" style={{ fontSize: 11 }}>{n.type} · {dt(n.createdAt)}</div>
                </div>
                {n.link && <a href={n.link} className="erp-muted" style={{ fontSize: 12, textDecoration: 'none' }} onClick={e => e.stopPropagation()}>перейти →</a>}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
