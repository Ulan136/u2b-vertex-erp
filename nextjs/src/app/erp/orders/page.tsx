'use client';
import * as React from 'react';
import { formatDate } from '@/lib/format';
import { useSearchParams } from 'next/navigation';
import { useApi, apiSend } from '@/lib/api';
import { toast } from '@/lib/toast';
import { Card, Badge, Button, PageTitle, Modal, Field, Input, Select, EmptyRow } from '@/components/ui';
import EntityHistory from '@/components/erp/EntityHistory';

type Order = { id: string; orderNo?: string | null; orderDate?: string | null; clientName?: string | null; address?: string | null; phone?: string | null; qty?: number | null; waterType?: string | null; status?: string | null; branchId?: string | null; comment?: string | null; source?: string | null; createdByName?: string | null };
type Branch = { id: string; name: string };

const SOURCES = [{ key: 'field_check', label: '🚗 Выездная' }, { key: 'tec', label: '⚡ ТЭЦ' }];
const STATUSES = ['В работе', 'Готова', 'Отменён'];
const dmy = (d?: string | null) => formatDate(d) || '—';
const statusTone = (s?: string | null): 'ok' | 'warn' | 'err' | 'neutral' => s === 'Готова' ? 'ok' : s === 'Отменён' ? 'err' : 'warn';
const EMPTY = { id: '', clientName: '', phone: '', address: '', qty: '1', waterType: 'х/в', branchId: '', status: 'В работе', comment: '' };

function OrdersInner() {
  const sp = useSearchParams();
  const initial = sp.get('source');
  const [source, setSource] = React.useState(initial === 'tec' ? 'tec' : 'field_check');
  const [branch, setBranch] = React.useState('all');
  const [q, setQ] = React.useState('');
  const qs = new URLSearchParams({ source }); if (branch !== 'all') qs.set('branch', branch);
  const { data: orders, error, isLoading, mutate } = useApi<Order[]>('/api/v2/orders?' + qs);
  const { data: branches } = useApi<Branch[]>('/api/v2/branches');
  const branchName = (id?: string | null) => (branches || []).find(b => b.id === id)?.name;

  const [modal, setModal] = React.useState(false);
  const [form, setForm] = React.useState<typeof EMPTY>(EMPTY);
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState('');

  const list = (orders || []).filter(o => !q.trim() || `${o.orderNo} ${o.clientName} ${o.address} ${o.phone}`.toLowerCase().includes(q.toLowerCase()));

  const openNew = () => { setForm(EMPTY); setErr(''); setModal(true); };
  const openEdit = (o: Order) => { setForm({ id: o.id, clientName: o.clientName || '', phone: o.phone || '', address: o.address || '', qty: o.qty ? String(o.qty) : '1', waterType: o.waterType || 'х/в', branchId: o.branchId || '', status: o.status || 'В работе', comment: o.comment || '' }); setErr(''); setModal(true); };

  async function save() {
    if (!form.clientName.trim()) { setErr('Укажите клиента'); return; }
    setSaving(true); setErr('');
    const body = { source, clientName: form.clientName.trim(), phone: form.phone || null, address: form.address || null, qty: Number(form.qty) || 1, waterType: form.waterType, branchId: form.branchId || null, status: form.status, comment: form.comment || null };
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

  return (
    <div>
      <PageTitle title="Заявки" sub={`${SOURCES.find(s => s.key === source)?.label} · всего: ${list.length}`} action={<Button onClick={openNew}>+ Заявка</Button>} />

      <Card className="erp-filters">
        <div className="erp-chips">{SOURCES.map(s => <button key={s.key} className={`erp-chip${source === s.key ? ' on' : ''}`} onClick={() => setSource(s.key)}>{s.label}</button>)}</div>
        <Select value={branch} onChange={e => setBranch(e.target.value)}><option value="all">Все филиалы</option>{(branches || []).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>
        <Input placeholder="🔍 №, клиент, адрес, телефон" value={q} onChange={e => setQ(e.target.value)} />
      </Card>

      <Card style={{ marginTop: 12, padding: 0, overflowX: 'auto' }}>
        {error ? <EmptyRow>Нет доступа к заявкам.</EmptyRow> : isLoading ? <EmptyRow>Загрузка…</EmptyRow>
          : list.length === 0 ? <EmptyRow>Заявок нет. Нажмите «+ Заявка».</EmptyRow>
          : (
            <table className="erp-table">
              <thead><tr><th>№</th><th>Дата</th><th>Клиент</th><th>Адрес</th><th>Тел.</th><th style={{ textAlign: 'right' }}>Кол-во</th><th>Филиал</th><th>Статус</th><th>Автор</th><th style={{ textAlign: 'right' }}></th></tr></thead>
              <tbody>
                {list.map(o => (
                  <tr key={o.id}>
                    <td className="erp-muted" style={{ fontSize: 12 }}>{o.orderNo}</td>
                    <td className="erp-muted" style={{ fontSize: 12 }}>{dmy(o.orderDate)}</td>
                    <td className="erp-td-main">{o.clientName || '—'}</td>
                    <td style={{ fontSize: 12 }}>{o.address || '—'}</td>
                    <td style={{ fontSize: 12 }}>{o.phone || '—'}</td>
                    <td style={{ textAlign: 'right' }}>{o.qty ?? '—'}</td>
                    <td style={{ fontSize: 12 }}>{branchName(o.branchId) || '—'}</td>
                    <td><Badge tone={statusTone(o.status)}>{o.status}</Badge></td>
                    <td className="erp-muted" style={{ fontSize: 12 }}>{o.createdByName || '—'}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {o.status === 'В работе' && <Button variant="outline" onClick={() => setStatus(o, 'Готова')} style={{ fontSize: 12, padding: '4px 8px' }}>Готова</Button>}
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
        <Field label="Адрес"><Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></Field>
        <div className="erp-form-row">
          <Field label="Кол-во приборов"><Input type="number" min={1} value={form.qty} onChange={e => setForm({ ...form, qty: e.target.value })} /></Field>
          <Field label="Вода"><Select value={form.waterType} onChange={e => setForm({ ...form, waterType: e.target.value })}><option>х/в</option><option>г/в</option></Select></Field>
        </div>
        <div className="erp-form-row">
          <Field label="Филиал"><Select value={form.branchId} onChange={e => setForm({ ...form, branchId: e.target.value })}><option value="">— головной —</option>{(branches || []).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
          <Field label="Статус"><Select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>{STATUSES.map(s => <option key={s}>{s}</option>)}</Select></Field>
        </div>
        <Field label="Комментарий"><Input value={form.comment} onChange={e => setForm({ ...form, comment: e.target.value })} /></Field>
        {form.id && <EntityHistory entityType="order" entityId={form.id} />}
      </Modal>
    </div>
  );
}

export default function OrdersPage() {
  return <React.Suspense fallback={<div className="erp-muted" style={{ padding: 20 }}>Загрузка…</div>}><OrdersInner /></React.Suspense>;
}
