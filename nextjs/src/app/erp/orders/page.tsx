'use client';
import * as React from 'react';
import { formatDate } from '@/lib/format';
import { useSearchParams } from 'next/navigation';
import { useApi, apiSend } from '@/lib/api';
import { toast } from '@/lib/toast';
import { Card, Badge, Button, PageTitle, Modal, Field, Input, Select, EmptyRow, DateRange } from '@/components/ui';
import EntityHistory from '@/components/erp/EntityHistory';
import YandexAddressPicker from '@/components/erp/YandexAddressPicker';

type Order = { id: string; orderNo?: string | null; orderDate?: string | null; clientName?: string | null; address?: string | null; phone?: string | null; qty?: number | null; waterType?: string | null; status?: string | null; branchId?: string | null; comment?: string | null; source?: string | null; createdByName?: string | null; createdAt?: string | null; lat?: number | null; lng?: number | null };
type Branch = { id: string; name: string; isHead?: boolean };
type Acct = { id: string; name: string; section?: string | null; icon?: string | null; isActive?: boolean };
type PayState = { order: Order; total: number; rows: Array<{ accountId: string; amount: string }>; saving: boolean; err: string };
const num = (v: unknown) => Number(v) || 0;
const fmtSum = (n: number) => Math.round(n).toLocaleString('ru-RU') + ' ₸';
// Подпись филиала «— Головной / — Филиал» выводим из флага isHead (не из имени).
const branchLabel = (b: Branch) => `${b.name} - ${b.isHead ? 'Головной' : 'Филиал'}`;

const SOURCES = [{ key: 'field_check', label: '🚗 Выездная' }, { key: 'tec', label: '⚡ ТЭЦ' }];
const STATUSES = ['В работе', 'Готова', 'Отменён'];
const dmy = (d?: string | null) => formatDate(d) || '—';
const statusTone = (s?: string | null): 'ok' | 'warn' | 'err' | 'neutral' => s === 'Готова' ? 'ok' : s === 'Отменён' ? 'err' : 'warn';
const EMPTY = { id: '', clientName: '', phone: '', address: '', qty: '1', waterType: 'х/в', branchId: '', status: 'В работе', comment: '', lat: null as number | null, lng: null as number | null };
// Ссылка «в Навигатор»: мобильное приложение Яндекс.Навигатор (deep link), иначе — веб-карты.
const naviUrl = (lat: number, lng: number) => `https://yandex.ru/maps/?rtext=~${lat},${lng}&rtt=auto`;

function OrdersInner() {
  const sp = useSearchParams();
  const initial = sp.get('source');
  const [source, setSource] = React.useState(initial === 'tec' ? 'tec' : 'field_check');
  const [branch, setBranch] = React.useState('all');
  const [q, setQ] = React.useState('');
  const [fFrom, setFFrom] = React.useState('');
  const [fTo, setFTo] = React.useState('');
  const [fWater, setFWater] = React.useState('');   // фильтр «Вода»: х/в / г/в
  const qs = new URLSearchParams({ source }); if (branch !== 'all') qs.set('branch', branch);
  const { data: orders, error, isLoading, mutate } = useApi<Order[]>('/api/v2/orders?' + qs);
  const { data: org } = useApi<{ yandexMapsKey?: string | null }>('/api/v2/org');
  const mapsKey = org?.yandexMapsKey || '';
  const { data: branches } = useApi<Branch[]>('/api/v2/branches');
  const branchName = (id?: string | null) => (branches || []).find(b => b.id === id)?.name;
  // Счета раздела «Поверка» — для приёма оплаты выездной заявки менеджером (как в кабинете мастера).
  const { data: fin } = useApi<{ accounts: Acct[] }>('/api/v2/finance');
  const payAccts = (fin?.accounts || []).filter(a => (a.section || '') === 'poverka' && a.isActive !== false);
  const [pay, setPay] = React.useState<PayState | null>(null);

  const [modal, setModal] = React.useState(false);
  const [form, setForm] = React.useState<typeof EMPTY>(EMPTY);
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState('');

  const list = (orders || []).filter(o => {
    if (q.trim() && !`${o.orderNo} ${o.clientName} ${o.address} ${o.phone}`.toLowerCase().includes(q.toLowerCase())) return false;
    const d = (o.orderDate || o.createdAt || '').slice(0, 10);
    if (fFrom && d < fFrom) return false;   // фильтр по дате заявки
    if (fTo && d > fTo) return false;
    if (fWater && (o.waterType || '') !== fWater) return false;
    return true;
  });

  const openNew = () => { setForm(EMPTY); setErr(''); setModal(true); };
  const openEdit = (o: Order) => { setForm({ id: o.id, clientName: o.clientName || '', phone: o.phone || '', address: o.address || '', qty: o.qty ? String(o.qty) : '1', waterType: o.waterType || 'х/в', branchId: o.branchId || '', status: o.status || 'В работе', comment: o.comment || '', lat: o.lat ?? null, lng: o.lng ?? null }); setErr(''); setModal(true); };

  async function save() {
    if (!form.clientName.trim()) { setErr('Укажите клиента'); return; }
    setSaving(true); setErr('');
    const body = { source, clientName: form.clientName.trim(), phone: form.phone || null, address: form.address || null, qty: Number(form.qty) || 1, waterType: form.waterType, branchId: form.branchId || null, status: form.status, comment: form.comment || null, lat: form.lat, lng: form.lng };
    try {
      if (form.id) await apiSend(`/api/v2/orders/${form.id}`, 'PATCH', body);
      else await apiSend('/api/v2/orders', 'POST', body);
      setModal(false); await mutate(); toast(form.id ? '✅ Заявка обновлена' : '✅ Заявка создана');
    } catch (e) { setErr((e as Error).message); } finally { setSaving(false); }
  }
  async function setStatus(o: Order, status: string) {
    try { await apiSend(`/api/v2/orders/${o.id}`, 'PATCH', { status }); await mutate(); toast('✅ ' + status); }
    catch (e) { toast('⚠️ ' + (e as Error).message); }
  }
  async function remove(o: Order) {
    if (!confirm(`Удалить заявку ${o.orderNo}?`)) return;
    try { await apiSend(`/api/v2/orders/${o.id}`, 'DELETE'); await mutate(); toast('🗑️ Удалено'); }
    catch (e) { toast('⚠️ ' + (e as Error).message); }
  }
  // ── Приём оплаты выездной заявки (менеджером) — по позициям заявки, приход на «Поверка» ──
  async function openPay(o: Order) {
    try {
      const certs: Array<{ amount?: string | number | null; payStatus?: string | null }> =
        await fetch(`/api/v2/certs?orderId=${o.id}`, { headers: { accept: 'application/json' }, cache: 'no-store' }).then(r => r.json());
      if (!Array.isArray(certs) || !certs.length) { toast('⚠️ У заявки нет позиций — мастер ещё не завёл счётчики'); return; }
      const total = Math.round(certs.reduce((s, c) => s + num(c.amount), 0) * 100) / 100;
      if (total <= 0) { toast('⚠️ У позиций не указана цена'); return; }
      if (certs.every(c => c.payStatus === 'Оплачено')) { toast('✅ Заявка уже оплачена'); return; }
      setPay({ order: o, total, rows: [{ accountId: '', amount: String(total) }], saving: false, err: '' });
    } catch { toast('⚠️ Не удалось загрузить позиции заявки'); }
  }
  function setPayRow(i: number, patch: Partial<{ accountId: string; amount: string }>) {
    setPay(p => p && { ...p, rows: p.rows.map((r, j) => j === i ? { ...r, ...patch } : r) });
  }
  async function submitPay() {
    if (!pay) return;
    const payments = pay.rows.filter(r => r.accountId && num(r.amount) > 0).map(r => ({ accountId: r.accountId, amount: num(r.amount) }));
    if (!payments.length) { setPay(p => p && { ...p, err: 'Укажите счёт и сумму' }); return; }
    const sum = Math.round(payments.reduce((s, p) => s + p.amount, 0) * 100) / 100;
    if (Math.abs(sum - pay.total) > 0.01) { setPay(p => p && { ...p, err: `Внесено ${fmtSum(sum)} ≠ итог ${fmtSum(pay.total)}` }); return; }
    setPay(p => p && { ...p, saving: true, err: '' });
    try {
      await apiSend(`/api/v2/orders/${pay.order.id}/payment`, 'POST', { payments });
      setPay(null); await mutate(); toast('✅ Оплата принята — приход на «Поверка»');
    } catch (e) { setPay(p => p && { ...p, saving: false, err: (e as Error).message }); }
  }

  return (
    <div>
      <PageTitle title="Заявки" sub={`${SOURCES.find(s => s.key === source)?.label} · всего: ${list.length}`} action={<Button onClick={openNew}>+ Заявка</Button>} />

      <Card className="erp-filters">
        <div className="erp-chips">{SOURCES.map(s => <button key={s.key} className={`erp-chip${source === s.key ? ' on' : ''}`} onClick={() => setSource(s.key)}>{s.label}</button>)}</div>
        <Select value={branch} onChange={e => setBranch(e.target.value)}><option value="all">Все филиалы</option>{(branches || []).map(b => <option key={b.id} value={b.id}>{branchLabel(b)}</option>)}</Select>
        <Input placeholder="🔍 №, клиент, адрес, телефон" value={q} onChange={e => setQ(e.target.value)} />
        <Select value={fWater} onChange={e => setFWater(e.target.value)} title="Тип воды"><option value="">Вода: все</option><option value="х/в">🔵 х/в (холодная)</option><option value="г/в">🔴 г/в (горячая)</option></Select>
        <DateRange from={fFrom} to={fTo} onChange={(f, t) => { setFFrom(f); setFTo(t); }} />
      </Card>

      <Card className="erp-journal" style={{ marginTop: 12, padding: 0 }}>
        {error ? <EmptyRow>Нет доступа к заявкам.</EmptyRow> : isLoading ? <EmptyRow>Загрузка…</EmptyRow>
          : list.length === 0 ? <EmptyRow>Заявок нет. Нажмите «+ Заявка».</EmptyRow>
          : (
            <table className="erp-table">
              <thead><tr><th>№</th><th>Дата</th><th>Клиент</th><th>Адрес</th><th>Тел.</th><th style={{ textAlign: 'right' }}>Кол-во</th><th>Филиал</th><th>Статус</th><th>Автор</th><th style={{ textAlign: 'right' }}></th></tr></thead>
              <tbody>
                {list.map(o => (
                  <tr key={o.id}>
                    <td className="erp-muted" style={{ fontSize: 12 }}>{o.orderNo}</td>
                    <td className="erp-muted" style={{ fontSize: 12 }}>{dmy(o.orderDate || o.createdAt)}</td>
                    <td className="erp-td-main">{o.clientName || '—'}</td>
                    <td style={{ fontSize: 12 }}>{o.address || '—'}</td>
                    <td style={{ fontSize: 12 }}>{o.phone || '—'}</td>
                    <td style={{ textAlign: 'right' }}>{o.qty ?? '—'}</td>
                    <td style={{ fontSize: 12 }}>{branchName(o.branchId) || '—'}</td>
                    <td><Badge tone={statusTone(o.status)}>{o.status}</Badge></td>
                    <td className="erp-muted" style={{ fontSize: 12 }}>{o.createdByName || '—'}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {o.lat != null && o.lng != null && <a className="erp-icon-btn" href={naviUrl(o.lat, o.lng)} target="_blank" rel="noopener noreferrer" title="🧭 Маршрут в Яндекс.Навигаторе" style={{ textDecoration: 'none', color: '#2563eb' }}>🧭</a>}
                      {o.status === 'В работе' && <Button variant="outline" onClick={() => setStatus(o, 'Готова')} style={{ fontSize: 12, padding: '4px 8px' }}>Готова</Button>}
                      {source === 'field_check' && <button className="erp-icon-btn" title="Принять оплату" style={{ color: '#16a34a' }} onClick={() => openPay(o)}>💵</button>}
                      <button className="erp-icon-btn" title="Изменить" onClick={() => openEdit(o)}>✏️</button>
                      <button className="erp-icon-btn" title="Удалить" style={{ color: '#dc2626' }} onClick={() => remove(o)}>🗑️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </Card>

      <Modal open={modal} onClose={() => setModal(false)} title={form.id ? '✏️ Заявка' : `➕ Новая заявка · ${SOURCES.find(s => s.key === source)?.label}`} width={560}
        footer={<><Button onClick={save} disabled={saving}>{saving ? 'Сохранение…' : 'Сохранить'}</Button><Button variant="outline" onClick={() => setModal(false)}>Отмена</Button></>}>
        {err && <div className="erp-form-err">{err}</div>}
        <div className="erp-form-row">
          <Field label="Клиент" required><Input value={form.clientName} onChange={e => setForm({ ...form, clientName: e.target.value })} autoFocus /></Field>
          <Field label="Телефон"><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></Field>
        </div>
        <Field label="Адрес"><YandexAddressPicker apiKey={mapsKey} address={form.address} lat={form.lat} lng={form.lng} onChange={v => setForm({ ...form, address: v.address, lat: v.lat, lng: v.lng })} /></Field>
        <div className="erp-form-row">
          <Field label="Кол-во приборов"><Input type="number" min={1} value={form.qty} onChange={e => setForm({ ...form, qty: e.target.value })} /></Field>
          <Field label="Вода"><Select value={form.waterType} onChange={e => setForm({ ...form, waterType: e.target.value })}><option>х/в</option><option>г/в</option></Select></Field>
        </div>
        <div className="erp-form-row">
          <Field label="Филиал"><Select value={form.branchId} onChange={e => setForm({ ...form, branchId: e.target.value })}><option value="">— головной ({(branches || []).find(b => b.isHead)?.name || 'головной'}) —</option>{(branches || []).filter(b => !b.isHead).map(b => <option key={b.id} value={b.id}>{b.name} - Филиал</option>)}</Select></Field>
          <Field label="Статус"><Select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>{STATUSES.map(s => <option key={s}>{s}</option>)}</Select></Field>
        </div>
        <Field label="Комментарий"><Input value={form.comment} onChange={e => setForm({ ...form, comment: e.target.value })} /></Field>
        {form.id && <EntityHistory entityType="order" entityId={form.id} />}
      </Modal>

      {/* Приём оплаты выездной заявки (менеджером). Итог = сумма цен позиций; оплаты
          должны его покрыть; приход идёт на счёт(а) раздела «Поверка». */}
      <Modal open={!!pay} onClose={() => { if (!pay?.saving) setPay(null); }} width={480}
        title={<span>💵 Приём оплаты · заявка {pay?.order.orderNo || ''}</span>}
        footer={<>
          <Button onClick={submitPay} disabled={pay?.saving}>{pay?.saving ? 'Приём…' : '✅ Принять оплату'}</Button>
          <Button variant="outline" onClick={() => setPay(null)} disabled={pay?.saving}>Отмена</Button>
        </>}>
        {pay && (() => {
          const entered = Math.round(pay.rows.reduce((s, r) => s + num(r.amount), 0) * 100) / 100;
          const diff = Math.round((pay.total - entered) * 100) / 100;
          return (
            <div>
              {pay.err && <div className="erp-form-err">{pay.err}</div>}
              <div style={{ fontSize: 14, marginBottom: 8 }}>Клиент: <b>{pay.order.clientName || '—'}</b> · итог по позициям: <b>{fmtSum(pay.total)}</b></div>
              {payAccts.length === 0 && <div className="erp-form-err">Нет счетов раздела «Поверка» — заведите счёт в Финансах.</div>}
              {pay.rows.map((r, i) => (
                <div key={i} className="erp-form-row" style={{ alignItems: 'end' }}>
                  <Field label={i === 0 ? 'Счёт' : ''}><Select value={r.accountId} onChange={e => setPayRow(i, { accountId: e.target.value })}><option value="">— счёт —</option>{payAccts.map(a => <option key={a.id} value={a.id}>{a.icon || '💳'} {a.name}</option>)}</Select></Field>
                  <Field label={i === 0 ? 'Сумма (₸)' : ''}><Input type="number" min={0} value={r.amount} onChange={e => setPayRow(i, { amount: e.target.value })} /></Field>
                </div>
              ))}
              <Button variant="outline" style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => setPay(p => p && { ...p, rows: [...p.rows, { accountId: '', amount: '' }] })}>+ ещё счёт</Button>
              <div style={{ fontSize: 13, marginTop: 8, color: Math.abs(diff) < 0.01 ? '#16a34a' : '#b45309' }}>
                Внесено: <b>{fmtSum(entered)}</b> из {fmtSum(pay.total)}{Math.abs(diff) < 0.01 ? ' — совпадает ✓' : diff > 0 ? ` · не хватает ${fmtSum(diff)}` : ` · лишние ${fmtSum(-diff)}`}
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}

export default function OrdersPage() {
  return <React.Suspense fallback={<div className="erp-muted" style={{ padding: 20 }}>Загрузка…</div>}><OrdersInner /></React.Suspense>;
}
