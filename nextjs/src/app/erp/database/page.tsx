'use client';
import * as React from 'react';
import { formatDate } from '@/lib/format';
import { useSearchParams } from 'next/navigation';
import { useApi, apiSend } from '@/lib/api';
import { toast } from '@/lib/toast';
import { Card, Badge, Button, PageTitle, EmptyRow } from '@/components/ui';

type Cert = { id: string; source: string; fio?: string | null; address?: string | null; phone?: string | null; serialNo?: string | null; meterType?: string | null; checkDate?: string | null; nextCheckDate?: string | null; photoCount?: number; orderId?: string | null };
type PhotoRow = { key: string; client: string; address: string; meta: string; date: string; photos: string[] };
type Position = { address?: string | null; qty?: number | null; water?: string | null };
type FieldOrder = { id: string; orderNo?: string | null; clientName?: string | null; phone?: string | null; address?: string | null; positions?: Position[]; photos?: string[]; status?: string | null; orderDate?: string | null; createdAt?: string | null; createdByName?: string | null };
type View = 'deadlines' | 'archive-cert' | 'archive-izv' | 'orders' | 'field-photos';
const dmy = (d?: string | null) => formatDate(d) || '—';
const today = () => new Date().toISOString().slice(0, 10);
const plus = (days: number) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
const TITLES: Record<View, { t: string; sub: string }> = {
  deadlines: { t: '⏰ Сроки счётчиков', sub: 'Реестр поверок · приближение срока очередной поверки' },
  'archive-cert': { t: '🗂 Архив сертификатов', sub: 'Сертификаты, отправленные в архив' },
  'archive-izv': { t: '📭 Архив извещений', sub: 'Извещения, отправленные в архив' },
  orders: { t: '📋 Авто-заказы', sub: 'Счётчики с истекающим сроком — кандидаты на заявку' },
  'field-photos': { t: '📷 Фотоотчёты выезда', sub: 'Фото со счётчиков, снятые мастером на заявке' },
};
const navBtn: React.CSSProperties = { background: 'rgba(255,255,255,.15)', color: '#fff', border: 'none', borderRadius: '50%', width: 44, height: 44, fontSize: 26, lineHeight: 1, cursor: 'pointer', flexShrink: 0 };

function DatabaseInner() {
  const sp = useSearchParams();
  const [view, setView] = React.useState<View>((sp.get('view') as View) || 'deadlines');
  React.useEffect(() => { const v = sp.get('view') as View; if (v && TITLES[v]) setView(v); }, [sp]);

  const { data: activeCert, isLoading: l1, error, mutate: mCert } = useApi<Cert[]>('/api/v2/certs?archived=false&type=cert');
  const { data: arcCert, mutate: mArcCert } = useApi<Cert[]>('/api/v2/certs?archived=true&type=cert');
  const { data: arcIzv, mutate: mArcIzv } = useApi<Cert[]>('/api/v2/certs?archived=true&type=izv');
  // Фотоотчёты грузим лениво — только на своей вкладке. Фото теперь на
  // сертификатах (по ссылке /api/v2/certs/{id}/photo/{n}); заявки с order.photos —
  // легаси со старого потока, показываем тоже, чтобы ничего не потерять.
  const { data: fieldCerts, isLoading: lCerts } = useApi<Cert[]>(view === 'field-photos' ? '/api/v2/certs?source=Выездная' : null);
  const { data: fieldOrders, isLoading: lOrders } = useApi<FieldOrder[]>(view === 'field-photos' ? '/api/v2/orders?source=field_check' : null);

  // Полноэкранный просмотрщик фото одной заявки.
  const [viewer, setViewer] = React.useState<{ photos: string[]; idx: number; title: string } | null>(null);
  React.useEffect(() => {
    if (!viewer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setViewer(null);
      else if (e.key === 'ArrowLeft') setViewer(v => v && { ...v, idx: (v.idx - 1 + v.photos.length) % v.photos.length });
      else if (e.key === 'ArrowRight') setViewer(v => v && { ...v, idx: (v.idx + 1) % v.photos.length });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewer]);

  const t = today(); const soonBound = plus(60);
  const deadlines = (activeCert || []).filter(c => c.nextCheckDate).sort((a, b) => String(a.nextCheckDate).localeCompare(String(b.nextCheckDate)));
  const expiring = deadlines.filter(c => String(c.nextCheckDate).slice(0, 10) <= soonBound);
  const dtOf = (o: FieldOrder) => o.orderDate || o.createdAt || '';
  const addrOf = (o: FieldOrder) => (Array.isArray(o.positions) && o.positions[0]?.address) || o.address || '—';
  const lPhotos = lCerts || lOrders;
  // Единый список фотоотчётов: строки из сертификатов (фото по ссылке) + легаси
  // из order.photos. Новые сверху.
  const photoRows: PhotoRow[] = [
    ...(fieldCerts || []).filter(c => (c.photoCount || 0) > 0).map(c => ({
      key: 'c' + c.id, client: c.fio || '—', address: c.address || '—',
      meta: `${c.meterType || 'Прибор'}${c.serialNo ? ' №' + c.serialNo : ''}`,
      date: c.checkDate || '', photos: Array.from({ length: c.photoCount || 0 }, (_, i) => `/api/v2/certs/${c.id}/photo/${i}`),
    })),
    ...(fieldOrders || []).filter(o => Array.isArray(o.photos) && o.photos.length > 0).map(o => ({
      key: 'o' + o.id, client: o.clientName || '—', address: addrOf(o),
      meta: `заявка ${o.orderNo || ''}`.trim(), date: dtOf(o), photos: o.photos as string[],
    })),
  ].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const openViewer = (row: PhotoRow, idx: number) => setViewer({ photos: row.photos, idx, title: `${row.client} · ${row.meta}` });
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
        {(['deadlines', 'archive-cert', 'archive-izv', 'orders', 'field-photos'] as View[]).map(v => (
          <button key={v} className={`erp-chip${view === v ? ' on' : ''}`} onClick={() => setView(v)}>
            {TITLES[v].t}{v === 'archive-cert' ? ` (${(arcCert || []).length})` : v === 'archive-izv' ? ` (${(arcIzv || []).length})` : v === 'orders' ? ` (${expiring.length})` : v === 'field-photos' && (fieldCerts || fieldOrders) ? ` (${photoRows.length})` : ''}
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

            {view === 'field-photos' && (lPhotos && photoRows.length === 0 ? <EmptyRow>Загрузка…</EmptyRow> : photoRows.length === 0 ? <EmptyRow>Пока нет фото. Мастер прикрепляет их к позициям заявки в мобильном кабинете.</EmptyRow> : (
              <table className="erp-table">
                <thead><tr><th>Клиент</th><th>Адрес</th><th>Прибор / заявка</th><th>Дата</th><th style={{ textAlign: 'right' }}>Фото</th></tr></thead>
                <tbody>{photoRows.map(row => (
                  <tr key={row.key}>
                    <td className="erp-td-main">{row.client}</td>
                    <td style={{ fontSize: 12 }}>{row.address}</td>
                    <td style={{ fontSize: 12 }}>{row.meta}</td>
                    <td style={{ fontSize: 12 }}>{dmy(row.date)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center', justifyContent: 'flex-end' }}>
                        {row.photos.slice(0, 3).map((p, i) => (
                          <img key={i} src={p} alt="" loading="lazy" onClick={() => openViewer(row, i)} style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, border: '1px solid #e5e7eb', cursor: 'pointer', background: '#f3f4f6' }} />
                        ))}
                        <button className="erp-icon-btn" title="Смотреть все фото" onClick={() => openViewer(row, 0)} style={{ whiteSpace: 'nowrap' }}>📷 {row.photos.length}</button>
                      </div>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            ))}
          </>
        )}
      </Card>

      {viewer && (
        <div onClick={() => setViewer(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.88)', zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ position: 'absolute', top: 12, left: 16, color: '#fff', fontSize: 14, fontWeight: 600, maxWidth: '60vw', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{viewer.title} · {viewer.idx + 1}/{viewer.photos.length}</div>
          <button onClick={(e) => { e.stopPropagation(); setViewer(null); }} style={{ position: 'absolute', top: 10, right: 14, background: 'rgba(255,255,255,.15)', color: '#fff', border: 'none', borderRadius: 20, padding: '6px 14px', fontSize: 14, cursor: 'pointer' }}>✕ Закрыть</button>
          <div onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 12, maxWidth: '100%' }}>
            {viewer.photos.length > 1 && <button aria-label="Назад" onClick={() => setViewer(v => v && { ...v, idx: (v.idx - 1 + v.photos.length) % v.photos.length })} style={navBtn}>‹</button>}
            <img src={viewer.photos[viewer.idx]} alt="" style={{ maxWidth: '78vw', maxHeight: '76vh', objectFit: 'contain', borderRadius: 8, background: '#111' }} />
            {viewer.photos.length > 1 && <button aria-label="Вперёд" onClick={() => setViewer(v => v && { ...v, idx: (v.idx + 1) % v.photos.length })} style={navBtn}>›</button>}
          </div>
          {viewer.photos.length > 1 && (
            <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 6, marginTop: 12, overflowX: 'auto', maxWidth: '92vw', paddingBottom: 4 }}>
              {viewer.photos.map((p, i) => (
                <img key={i} src={p} alt="" onClick={() => setViewer(v => v && { ...v, idx: i })} style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 6, cursor: 'pointer', flexShrink: 0, border: i === viewer.idx ? '2px solid #3b82f6' : '2px solid transparent', opacity: i === viewer.idx ? 1 : .55 }} />
              ))}
            </div>
          )}
          <a href={viewer.photos[viewer.idx]} download={`фото-${viewer.idx + 1}.jpg`} onClick={e => e.stopPropagation()} style={{ marginTop: 10, color: '#fff', fontSize: 13, textDecoration: 'underline' }}>⬇ Скачать это фото</a>
        </div>
      )}
    </div>
  );
}

export default function DatabasePage() {
  return <React.Suspense fallback={<div className="erp-muted" style={{ padding: 20 }}>Загрузка…</div>}><DatabaseInner /></React.Suspense>;
}
