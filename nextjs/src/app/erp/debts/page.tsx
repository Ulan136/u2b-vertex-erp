'use client';
import * as React from 'react';
import { useApi, apiSend } from '@/lib/api';
import { toast } from '@/lib/toast';
import { Card, Badge, Button, PageTitle, Modal, Field, Input, Select, EmptyRow } from '@/components/ui';

type Debt = { id: string; type: string; amount: string | number; paidAmount: string | number; status: string; clientName?: string | null; counterpartyName?: string | null; accountId?: string | null; accountName?: string | null; dueDate?: string | null };
type Acct = { id: string; name: string; icon?: string | null };
type Client = { id: string; name: string };

const fmt = (n: number | string) => Math.round(Number(n) || 0).toLocaleString('ru-RU') + ' ₸';
const dmy = (d?: string | null) => (d ? String(d).slice(0, 10).split('-').reverse().join('.') : '—');
const today = () => new Date().toISOString().slice(0, 10);
const remaining = (d: Debt) => Math.max(0, (Number(d.amount) || 0) - (Number(d.paidAmount) || 0));
const counterparty = (d: Debt) => d.clientName || d.counterpartyName || '—';
const overdue = (d: Debt) => d.status !== 'closed' && d.dueDate && String(d.dueDate).slice(0, 10) < today();

export default function DebtsPage() {
  const [tab, setTab] = React.useState('all');
  const [q, setQ] = React.useState('');
  const qs = new URLSearchParams(); if (tab !== 'all') qs.set('type', tab); if (q.trim()) qs.set('q', q.trim());
  const { data: debts, error, isLoading, mutate } = useApi<Debt[]>('/api/v2/debts' + (qs.toString() ? '?' + qs : ''));
  const { data: all } = useApi<Debt[]>('/api/v2/debts');
  const { data: fin } = useApi<{ accounts: Acct[] }>('/api/v2/finance');
  const { data: clients } = useApi<Client[]>('/api/v2/clients');
  const accounts = fin?.accounts || [];

  const list = debts || [];
  const sumRem = (type: string) => (all || []).filter(d => d.type === type && d.status !== 'closed').reduce((s, d) => s + remaining(d), 0);
  const overdueSum = (all || []).filter(d => overdue(d)).reduce((s, d) => s + remaining(d), 0);

  const [modal, setModal] = React.useState(false);
  const [form, setForm] = React.useState({ type: 'debit', name: '', amount: '', accountId: '', dueDate: '', comment: '', err: '', saving: false });
  const [pay, setPay] = React.useState({ open: false, debt: null as Debt | null, amount: '', accountId: '', date: today(), comment: '', err: '', saving: false });

  async function saveDebt() {
    if (!form.name.trim()) { setForm(f => ({ ...f, err: 'Укажите контрагента' })); return; }
    const amt = Number(form.amount) || 0; if (amt <= 0) { setForm(f => ({ ...f, err: 'Сумма больше 0' })); return; }
    setForm(f => ({ ...f, saving: true, err: '' }));
    try {
      await apiSend('/api/v2/debts', 'POST', { type: form.type, counterpartyName: form.name.trim(), amount: amt, accountId: form.accountId || null, dueDate: form.dueDate || null, comment: form.comment || null });
      setModal(false); await mutate(); toast('✅ Долг добавлен');
    } catch (e) { setForm(f => ({ ...f, err: (e as Error).message, saving: false })); }
  }
  function openPay(d: Debt) { setPay({ open: true, debt: d, amount: String(remaining(d)), accountId: d.accountId || '', date: today(), comment: '', err: '', saving: false }); }
  async function savePay() {
    if (!pay.debt) return;
    const amt = Number(pay.amount) || 0; if (amt <= 0) { setPay(p => ({ ...p, err: 'Сумма больше 0' })); return; }
    setPay(p => ({ ...p, saving: true, err: '' }));
    try {
      await apiSend(`/api/v2/debts/${pay.debt.id}/payments`, 'POST', { amount: amt, accountId: pay.accountId || null, payDate: pay.date || null, comment: pay.comment || null });
      setPay(p => ({ ...p, open: false })); await mutate(); toast('✅ Погашение проведено (операция в финансах)');
    } catch (e) { setPay(p => ({ ...p, err: (e as Error).message, saving: false })); }
  }
  async function remove(d: Debt) {
    if (!confirm('Удалить долг? Связанные погашения/операции будут откачены.')) return;
    try { await apiSend(`/api/v2/debts/${d.id}`, 'DELETE'); await mutate(); toast('🗑️ Удалено'); }
    catch (e) { toast('⚠️ ' + (e as Error).message); }
  }

  return (
    <div>
      <PageTitle title="Долги" sub="Дебиторка и кредиторка" action={<Button onClick={() => { setForm({ type: tab === 'credit' ? 'credit' : 'debit', name: '', amount: '', accountId: '', dueDate: '', comment: '', err: '', saving: false }); setModal(true); }}>+ Долг</Button>} />

      <div className="erp-kpi-grid">
        <div className="erp-kpi"><div className="erp-kpi-top"><span className="erp-kpi-ico">📥</span><span className="erp-kpi-label">Дебиторка (нам должны)</span></div><div className="erp-kpi-val" style={{ color: '#16a34a' }}>{fmt(sumRem('debit'))}</div></div>
        <div className="erp-kpi"><div className="erp-kpi-top"><span className="erp-kpi-ico">📤</span><span className="erp-kpi-label">Кредиторка (мы должны)</span></div><div className="erp-kpi-val" style={{ color: '#dc2626' }}>{fmt(sumRem('credit'))}</div></div>
        <div className="erp-kpi"><div className="erp-kpi-top"><span className="erp-kpi-ico">⏰</span><span className="erp-kpi-label">Просрочено</span></div><div className="erp-kpi-val" style={{ color: '#b45309' }}>{fmt(overdueSum)}</div></div>
      </div>

      <Card className="erp-filters" style={{ marginTop: 12 }}>
        <div className="erp-chips">
          {[['all', 'Все'], ['debit', '📥 Дебиторка'], ['credit', '📤 Кредиторка']].map(([k, l]) => <button key={k} className={`erp-chip${tab === k ? ' on' : ''}`} onClick={() => setTab(k)}>{l}</button>)}
        </div>
        <Input placeholder="🔍 Контрагент" value={q} onChange={e => setQ(e.target.value)} />
      </Card>

      <Card style={{ marginTop: 12, padding: 0 }}>
        {error ? <EmptyRow>Нет доступа к долгам.</EmptyRow> : isLoading ? <EmptyRow>Загрузка…</EmptyRow>
          : list.length === 0 ? <EmptyRow>Долгов нет. Нажмите «+ Долг».</EmptyRow>
          : (
            <table className="erp-table">
              <thead><tr><th>Контрагент</th><th style={{ textAlign: 'right' }}>Сумма</th><th style={{ textAlign: 'right' }}>Оплачено</th><th style={{ textAlign: 'right' }}>Остаток</th><th>Срок</th><th>Статус</th><th style={{ textAlign: 'right' }}>Действия</th></tr></thead>
              <tbody>
                {list.map(d => (
                  <tr key={d.id}>
                    <td className="erp-td-main">{d.type === 'debit' ? '📥' : '📤'} {counterparty(d)}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(d.amount)}</td>
                    <td style={{ textAlign: 'right', color: '#059669' }}>{fmt(d.paidAmount)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(remaining(d))}</td>
                    <td style={overdue(d) ? { color: '#dc2626', fontWeight: 600 } : undefined}>{dmy(d.dueDate)}{overdue(d) ? ' ⏰' : ''}</td>
                    <td><Badge tone={d.status === 'closed' ? 'ok' : d.status === 'partial' ? 'warn' : 'info'}>{d.status === 'closed' ? '✅ Закрыт' : d.status === 'partial' ? '◐ Частично' : '● Открыт'}</Badge></td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {d.status !== 'closed' && <Button variant="outline" onClick={() => openPay(d)} style={{ fontSize: 12, padding: '4px 8px' }}>Погасить</Button>}
                      <button className="erp-icon-btn" title="Удалить" style={{ color: '#dc2626' }} onClick={() => remove(d)}>🗑️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </Card>

      <Modal open={modal} onClose={() => setModal(false)} title="💳 Новый долг"
        footer={<><Button onClick={saveDebt} disabled={form.saving}>{form.saving ? 'Сохранение…' : 'Сохранить'}</Button><Button variant="outline" onClick={() => setModal(false)}>Отмена</Button></>}>
        {form.err && <div className="erp-form-err">{form.err}</div>}
        <div className="erp-chips" style={{ marginBottom: 12 }}>
          {[['debit', '📥 Нам должны'], ['credit', '📤 Мы должны']].map(([k, l]) => <button key={k} className={`erp-chip${form.type === k ? ' on' : ''}`} onClick={() => setForm(f => ({ ...f, type: k }))}>{l}</button>)}
        </div>
        <Field label="Контрагент" required>
          <Select value="" onChange={e => { const c = (clients || []).find(x => x.id === e.target.value); if (c) setForm(f => ({ ...f, name: c.name })); }}><option value="">— из клиентов или впишите —</option>{(clients || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
          <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="название / ФИО" style={{ marginTop: 6 }} />
        </Field>
        <div className="erp-form-row">
          <Field label="Сумма (₸)" required><Input type="number" min={0} value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} /></Field>
          <Field label="Срок"><Input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} /></Field>
        </div>
        <Field label="Счёт (для погашения)"><Select value={form.accountId} onChange={e => setForm(f => ({ ...f, accountId: e.target.value }))}><option value="">— без счёта —</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}</Select></Field>
        <Field label="Комментарий"><Input value={form.comment} onChange={e => setForm(f => ({ ...f, comment: e.target.value }))} /></Field>
      </Modal>

      <Modal open={pay.open} onClose={() => setPay(p => ({ ...p, open: false }))} title={`💵 Погашение — ${pay.debt ? counterparty(pay.debt) : ''}`}
        footer={<><Button onClick={savePay} disabled={pay.saving}>{pay.saving ? 'Проведение…' : 'Провести'}</Button><Button variant="outline" onClick={() => setPay(p => ({ ...p, open: false }))}>Отмена</Button></>}>
        {pay.err && <div className="erp-form-err">{pay.err}</div>}
        {pay.debt && <div className="erp-muted" style={{ fontSize: 12, marginBottom: 10 }}>Остаток: <b>{fmt(remaining(pay.debt))}</b></div>}
        <div className="erp-form-row">
          <Field label="Сумма (₸)" required><Input type="number" min={0} value={pay.amount} onChange={e => setPay(p => ({ ...p, amount: e.target.value }))} /></Field>
          <Field label="Дата"><Input type="date" value={pay.date} onChange={e => setPay(p => ({ ...p, date: e.target.value }))} /></Field>
        </div>
        <Field label="Счёт (приход/расход)"><Select value={pay.accountId} onChange={e => setPay(p => ({ ...p, accountId: e.target.value }))}><option value="">— без счёта —</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}</Select></Field>
        <Field label="Комментарий"><Input value={pay.comment} onChange={e => setPay(p => ({ ...p, comment: e.target.value }))} /></Field>
      </Modal>
    </div>
  );
}
