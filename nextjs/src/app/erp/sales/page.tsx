'use client';
import * as React from 'react';
import { useApi, apiSend } from '@/lib/api';
import { toast } from '@/lib/toast';
import { Card, Badge, Button, PageTitle, Modal, Field, Input, Select, EmptyRow } from '@/components/ui';
import EntityHistory from '@/components/erp/EntityHistory';

type Sale = { id: string; saleNo?: string | null; saleDate?: string | null; clientName?: string | null; productName?: string | null; skuCode?: string | null; qty?: number; price?: string | number; totalSum?: string | number; payStatus?: string | null; invoiceType?: string | null; cancelledAt?: string | null };
type Client = { id: string; name: string };
type Product = { id: string; skuCode: string; name: string; price: string | number; currentStock: number };
type Acct = { id: string; name: string; section?: string | null; icon?: string | null };

const fmt = (n: number | string) => (Number(n) || 0).toLocaleString('ru-RU');
const dmy = (d?: string | null) => (d ? String(d).slice(0, 10).split('-').reverse().join('.') : '');
const today = () => new Date().toISOString().slice(0, 10);
const EMPTY = { clientName: '', productId: '', productName: '', skuCode: '', price: '', qty: '1', payStatus: 'Оплачено', accountId: '', saleDate: today(), comment: '' };

export default function SalesPage() {
  const { data: sales, error, isLoading, mutate } = useApi<Sale[]>('/api/v2/sales');
  const { data: clients } = useApi<Client[]>('/api/v2/clients');
  const { data: products } = useApi<Product[]>('/api/v2/products');
  const { data: fin } = useApi<{ accounts: Acct[] }>('/api/v2/finance');
  const { data: session } = useApi<{ user?: { role?: string } }>('/api/auth/session');
  const canCancel = ['admin', 'accountant'].includes(session?.user?.role || '');
  const saleAccounts = (fin?.accounts || []).filter(a => (a.section || '') === 'sale');

  const [modal, setModal] = React.useState(false);
  const [form, setForm] = React.useState<typeof EMPTY>(EMPTY);
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState('');
  const [histSale, setHistSale] = React.useState<Sale | null>(null);

  const list = sales || [];
  const total = list.filter(x => !x.cancelledAt).reduce((s, x) => s + (Number(x.totalSum) || 0), 0);
  const activeCount = list.filter(x => !x.cancelledAt).length;

  async function cancelSale(s: Sale) {
    if (!confirm(`Отменить продажу ${s.saleNo}?\n\nПриход в финансах будет сторнирован, остаток вернётся на склад. Продажа останется в журнале как «Отменена».`)) return;
    try {
      await apiSend(`/api/v2/sales/${s.id}/cancel`, 'POST');
      await mutate();
      toast('↩️ Продажа отменена: сторно + возврат склада');
    } catch (e) { toast('⚠️ ' + (e as Error).message); }
  }

  function openNew() { setForm({ ...EMPTY, accountId: saleAccounts[0]?.id || '' }); setErr(''); setModal(true); }

  async function save() {
    if (!form.clientName.trim()) { setErr('Укажите клиента'); return; }
    if (!form.productId) { setErr('Выберите товар'); return; }
    const qty = Number(form.qty) || 0;
    if (qty <= 0) { setErr('Количество больше 0'); return; }
    if (form.payStatus === 'Оплачено' && !form.accountId) { setErr('Выберите счёт зачисления'); return; }
    setSaving(true); setErr('');
    try {
      await apiSend('/api/v2/sales', 'POST', {
        clientName: form.clientName.trim(), productId: form.productId, productName: form.productName, skuCode: form.skuCode,
        price: Number(form.price) || 0, qty, payStatus: form.payStatus, saleDate: form.saleDate || null,
        accountId: form.payStatus === 'Оплачено' ? form.accountId : null,
        invoiceType: saleAccounts.find(a => a.id === form.accountId)?.name || null, comment: form.comment || null,
      });
      setModal(false); await mutate();
      toast(form.payStatus === 'Оплачено' ? '✅ Продажа: приход в финансы + списан склад' : '✅ Продажа записана');
    } catch (e) { setErr((e as Error).message); } finally { setSaving(false); }
  }

  return (
    <div>
      <PageTitle title="Продажи" sub={`Активных: ${activeCount} · на ${fmt(total)} ₸`} action={<Button onClick={openNew}>+ Продажа</Button>} />

      <Card style={{ padding: 0 }}>
        {error ? <EmptyRow>Нет доступа к продажам.</EmptyRow> : isLoading ? <EmptyRow>Загрузка…</EmptyRow>
          : list.length === 0 ? <EmptyRow>Продаж пока нет. Нажмите «+ Продажа».</EmptyRow>
          : (
            <table className="erp-table">
              <thead><tr><th>№</th><th>Дата</th><th>Клиент</th><th>Товар</th><th style={{ textAlign: 'right' }}>Кол-во</th><th style={{ textAlign: 'right' }}>Сумма</th><th>Оплата</th><th>Счёт</th><th></th></tr></thead>
              <tbody>
                {list.map(s => {
                  const cancelled = !!s.cancelledAt;
                  return (
                  <tr key={s.id} style={cancelled ? { opacity: 0.55 } : undefined}>
                    <td className="erp-muted" style={{ fontSize: 12 }}>{s.saleNo}</td>
                    <td className="erp-muted" style={{ fontSize: 12 }}>{dmy(s.saleDate)}</td>
                    <td className="erp-td-main">{s.clientName || '—'}</td>
                    <td style={cancelled ? { textDecoration: 'line-through' } : undefined}>{s.productName || '—'} <span className="erp-muted" style={{ fontSize: 11 }}>{s.skuCode}</span></td>
                    <td style={{ textAlign: 'right' }}>{fmt(s.qty || 0)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, ...(cancelled ? { textDecoration: 'line-through' } : {}) }}>{fmt(s.totalSum || 0)} ₸</td>
                    <td>{cancelled ? <Badge tone="err">✕ Отменена</Badge> : <Badge tone={s.payStatus === 'Оплачено' ? 'ok' : 'warn'}>{s.payStatus === 'Оплачено' ? '✓ Оплачено' : '⏳ Ожидает'}</Badge>}</td>
                    <td className="erp-muted" style={{ fontSize: 12 }}>{s.invoiceType || '—'}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button className="erp-icon-btn" title="История" onClick={() => setHistSale(s)}>🕘</button>
                      {!cancelled && canCancel && <button className="erp-icon-btn" title="Отменить продажу" onClick={() => cancelSale(s)}>↩️</button>}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          )}
      </Card>

      <Modal open={modal} onClose={() => setModal(false)} title="➕ Новая продажа" width={560}
        footer={<><Button onClick={save} disabled={saving}>{saving ? 'Сохранение…' : 'Провести продажу'}</Button><Button variant="outline" onClick={() => setModal(false)}>Отмена</Button></>}>
        {err && <div className="erp-form-err">{err}</div>}
        <Field label="Клиент" required>
          <Select value="" onChange={e => { const c = (clients || []).find(x => x.id === e.target.value); if (c) setForm(f => ({ ...f, clientName: c.name })); }}>
            <option value="">— из клиентов или впишите ниже —</option>
            {(clients || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Input value={form.clientName} onChange={e => setForm(f => ({ ...f, clientName: e.target.value }))} placeholder="ФИО / название" style={{ marginTop: 6 }} />
        </Field>
        <Field label="Товар" required>
          <Select value={form.productId} onChange={e => { const p = (products || []).find(x => x.id === e.target.value); setForm(f => ({ ...f, productId: e.target.value, productName: p?.name || '', skuCode: p?.skuCode || '', price: p ? String(p.price) : f.price })); }}>
            <option value="">— выберите —</option>
            {(products || []).map(p => <option key={p.id} value={p.id}>{p.skuCode} · {p.name} (ост. {p.currentStock})</option>)}
          </Select>
        </Field>
        <div className="erp-form-row">
          <Field label="Количество" required><Input type="number" min={1} value={form.qty} onChange={e => setForm(f => ({ ...f, qty: e.target.value }))} /></Field>
          <Field label="Цена за ед. (₸)"><Input type="number" min={0} value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} /></Field>
        </div>
        <div style={{ textAlign: 'right', fontSize: 13, color: '#334155', margin: '-4px 0 8px' }}>Итого: <b>{fmt((Number(form.qty) || 0) * (Number(form.price) || 0))} ₸</b></div>
        <div className="erp-form-row">
          <Field label="Дата"><Input type="date" value={form.saleDate} onChange={e => setForm(f => ({ ...f, saleDate: e.target.value }))} /></Field>
          <Field label="Оплата"><Select value={form.payStatus} onChange={e => setForm(f => ({ ...f, payStatus: e.target.value }))}><option>Оплачено</option><option>В ожидании</option></Select></Field>
        </div>
        {form.payStatus === 'Оплачено' && (
          <Field label="Счёт зачисления (раздел «Продажа»)" required>
            <Select value={form.accountId} onChange={e => setForm(f => ({ ...f, accountId: e.target.value }))}>
              <option value="">— выберите счёт —</option>
              {saleAccounts.map(a => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
            </Select>
            <div className="erp-muted" style={{ fontSize: 11, marginTop: 4 }}>При «Оплачено» создаётся приход в Финансах и списывается остаток со склада.</div>
          </Field>
        )}
        <Field label="Комментарий"><Input value={form.comment} onChange={e => setForm(f => ({ ...f, comment: e.target.value }))} /></Field>
      </Modal>

      <Modal open={!!histSale} onClose={() => setHistSale(null)} title={`Продажа ${histSale?.saleNo || ''}`}
        footer={<Button variant="outline" onClick={() => setHistSale(null)}>Закрыть</Button>}>
        {histSale && <EntityHistory entityType="sale" entityId={histSale.id} />}
      </Modal>
    </div>
  );
}
