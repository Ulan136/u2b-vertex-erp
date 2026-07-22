'use client';
import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { useApi, apiSend } from '@/lib/api';
import { toast } from '@/lib/toast';
import { Card, Badge, Button, PageTitle, EmptyRow } from '@/components/ui';

type Cert = { id: string; source: string; fio?: string | null; address?: string | null; phone?: string | null; serialNo?: string | null; meterType?: string | null; checkDate?: string | null; nextCheckDate?: string | null };
type View = 'deadlines' | 'archive-cert' | 'archive-izv' | 'orders';
const dmy = (d?: string | null) => (d ? String(d).slice(0, 10).split('-').reverse().join('.') : '—');
const today = () => new Date().toISOString().slice(0, 10);
const plus = (days: number) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
const TITLES: Record<View, { t: string; sub: string }> = {
  deadlines: { t: '⏰ Сроки счётчиков', sub: 'Реестр поверок · приближение срока очередной поверки' },
  'archive-cert': { t: '🗂 Архив сертификатов', sub: 'Сертификаты, отправленные в архив' },
  'archive-izv': { t: '📭 Архив извещений', sub: 'Извещения, отправленные в архив' },
  orders: { t: '📋 Авто-заказы', sub: 'Счётчики с истекающим сроком — кандидаты на заявку' },
};

function DatabaseInner() {
  const sp = useSearchParams();
  const [view, setView] = React.useState<View>((sp.get('view') as View) || 'deadlines');
  React.useEffect(() => { const v = sp.get('view') as View; if (v && TITLES[v]) setView(v); }, [sp]);

  const { data: activeCert, isLoading: l1, error, mutate: mCert } = useApi<Cert[]>('/api/v2/certs?archived=false&type=cert');
  const { data: arcCert, mutate: mArcCert } = useApi<Cert[]>('/api/v2/certs?archived=true&type=cert');
  const { data: arcIzv, mutate: mArcIzv } = useApi<Cert[]>('/api/v2/certs?archived=true&type=izv');

  const t = today(); const soonBound = plus(60);
  const deadlines = (activeCert || []).filter(c => c.nextCheckDate).sort((a, b) => String(a.nextCheckDate).localeCompare(String(b.nextCheckDate)));
  const expiring = deadlines.filter(c => String(c.nextCheckDate).slice(0, 10) <= soonBound);
  const meta = TITLES[view];

  async function archive(c: Cert, flag: boolean) {
    try { await apiSend(`/api/v2/certs/${c.id}`, 'PATCH', { isArchived: flag }); await Promise.all([mCert(), mArcCert(), mArcIzv()]); toast(flag ? '🗂 В архив' : '↩ Из архива'); }
    catch (e) { toast('⚠️ ' + (e as Error).message); }
  }
  async function makeOrder(c: Cert) {
    try { await apiSend('/api/v2/orders', 'POST', { source: 'field_check', clientName: c.fio || '', address: c.address || null, phone: c.phone || null, qty: 1, comment: `Авто-заказ: срок поверки ${dmy(c.nextCheckDate)}` }); toast('✅ Заявка создана (Выездная поверка)'); }
    catch (e) { toast('⚠️ ' + (e as Error).message); }
  }

  const dateStatus = (c: Cert) => {
    const d = String(c.nextCheckDate).slice(0, 10);
    return d < t ? <Badge tone="err">просрочено</Badge> : d <= soonBound ? <Badge tone="warn">скоро</Badge> : <Badge tone="ok">в норме</Badge>;
  };

  return (
    <div>
      <PageTitle title="База данных" sub={meta.sub} />
      <Card className="erp-filters"><div className="erp-chips">
        {(['deadlines', 'archive-cert', 'archive-izv', 'orders'] as View[]).map(v => (
          <button key={v} className={`erp-chip${view === v ? ' on' : ''}`} onClick={() => setView(v)}>
            {TITLES[v].t}{v === 'archive-cert' ? ` (${(arcCert || []).length})` : v === 'archive-izv' ? ` (${(arcIzv || []).length})` : v === 'orders' ? ` (${expiring.length})` : ''}
          </button>
        ))}
      </div></Card>

      <Card style={{ marginTop: 12, padding: 0, overflowX: 'auto' }}>
        {error ? <EmptyRow>Нет доступа к базе данных.</EmptyRow> : l1 && view === 'deadlines' ? <EmptyRow>Загрузка…</EmptyRow> : (
          <>
            {view === 'deadlines' && (deadlines.length === 0 ? <EmptyRow>Нет записей с датой очередной поверки.</EmptyRow> : (
              <table className="erp-table">
                <thead><tr><th>ФИО / объект</th><th>Адрес</th><th>№ счётчика</th><th>Направление</th><th>Поверка</th><th>Следующая</th><th>Срок</th><th></th></tr></thead>
                <tbody>{deadlines.map(c => (
                  <tr key={c.id}>
                    <td className="erp-td-main">{c.fio}</td><td style={{ fontSize: 12 }}>{c.address || '—'}</td>
                    <td style={{ fontSize: 12, fontFamily: 'monospace' }}>{c.serialNo || '—'}</td><td style={{ fontSize: 12 }}>{c.source}</td>
                    <td style={{ fontSize: 12 }}>{dmy(c.checkDate)}</td><td style={{ fontSize: 12, fontWeight: 600 }}>{dmy(c.nextCheckDate)}</td>
                    <td>{dateStatus(c)}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}><button className="erp-icon-btn" title="В архив" onClick={() => archive(c, true)}>🗂</button></td>
                  </tr>
                ))}</tbody>
              </table>
            ))}

            {(view === 'archive-cert' || view === 'archive-izv') && (() => {
              const rows = view === 'archive-cert' ? (arcCert || []) : (arcIzv || []);
              return rows.length === 0 ? <EmptyRow>Архив пуст.</EmptyRow> : (
                <table className="erp-table">
                  <thead><tr><th>ФИО / объект</th><th>Адрес</th><th>№ счётчика</th><th>Направление</th><th>Дата поверки</th><th></th></tr></thead>
                  <tbody>{rows.map(c => (
                    <tr key={c.id}>
                      <td className="erp-td-main">{c.fio}</td><td style={{ fontSize: 12 }}>{c.address || '—'}</td>
                      <td style={{ fontSize: 12, fontFamily: 'monospace' }}>{c.serialNo || '—'}</td><td style={{ fontSize: 12 }}>{c.source}</td>
                      <td style={{ fontSize: 12 }}>{dmy(c.checkDate)}</td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}><button className="erp-icon-btn" title="Вернуть из архива" onClick={() => archive(c, false)}>↩</button></td>
                    </tr>
                  ))}</tbody>
                </table>
              );
            })()}

            {view === 'orders' && (expiring.length === 0 ? <EmptyRow>Нет счётчиков с истекающим сроком.</EmptyRow> : (
              <table className="erp-table">
                <thead><tr><th>Клиент / объект</th><th>Адрес</th><th>№ счётчика</th><th>Направление</th><th>Срок поверки</th><th>Статус</th><th></th></tr></thead>
                <tbody>{expiring.map(c => (
                  <tr key={c.id}>
                    <td className="erp-td-main">{c.fio}</td><td style={{ fontSize: 12 }}>{c.address || '—'}</td>
                    <td style={{ fontSize: 12, fontFamily: 'monospace' }}>{c.serialNo || '—'}</td><td style={{ fontSize: 12 }}>{c.source}</td>
                    <td style={{ fontSize: 12, fontWeight: 600 }}>{dmy(c.nextCheckDate)}</td><td>{dateStatus(c)}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}><Button variant="outline" onClick={() => makeOrder(c)} style={{ fontSize: 12, padding: '4px 8px' }}>+ Заявка</Button></td>
                  </tr>
                ))}</tbody>
              </table>
            ))}
          </>
        )}
      </Card>
    </div>
  );
}

export default function DatabasePage() {
  return <React.Suspense fallback={<div className="erp-muted" style={{ padding: 20 }}>Загрузка…</div>}><DatabaseInner /></React.Suspense>;
}
