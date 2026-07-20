'use client';
import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { useApi, apiSend } from '@/lib/api';
import { toast } from '@/lib/toast';
import { Card, Button, PageTitle, Modal, Field, Input, Select, EmptyRow } from '@/components/ui';

type Acct = { id: string; name: string; icon?: string | null; section?: string | null; sortOrder?: number | null };
type Op = { id: string; opType: string; amount: string | number; opDate?: string | null; name?: string | null; accountName?: string | null; accountId: string };
type Client = { id: string; name: string };

const SECTIONS = [{ key: 'poverka', no: 1, label: 'Поверка', color: '#2563eb' }, { key: 'sale', no: 2, label: 'Продажа', color: '#d97706' }, { key: 'branch', no: 3, label: 'Филиалы', color: '#0d9488' }, { key: 'other', no: 4, label: 'Прочие операции', color: '#6f42c1' }];
const fmt = (n: number | string) => (Number(n) || 0).toLocaleString('ru-RU') + ' ₸';
const dmy = (d?: string | null) => (d ? String(d).slice(0, 10).split('-').reverse().join('.') : '—');
const today = () => new Date().toISOString().slice(0, 10);

function InvoicesInner() {
  const sp = useSearchParams();
  const init = sp.get('section');
  const [section, setSection] = React.useState(SECTIONS.some(s => s.key === init) ? init! : 'poverka');
  const { data: fin, error, isLoading, mutate } = useApi<{ accounts: Acct[]; operations: Op[] }>('/api/v2/finance');
  const { data: clients } = useApi<Client[]>('/api/v2/clients');
  const accounts = (fin?.accounts || []).filter(a => (a.section || 'other') === section).sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0));
  const secOf = (id: string) => (fin?.accounts || []).find(a => a.id === id)?.section || 'other';
  const income = (fin?.operations || []).filter(o => o.opType === 'Приход' && secOf(o.accountId) === section);
  const total = income.reduce((s, o) => s + (Number(o.amount) || 0), 0);
  const sec = SECTIONS.find(s => s.key === section)!;

  const [modal, setModal] = React.useState(false);
  const [f, setF] = React.useState({ name: '', accountId: '', amount: '', date: today(), comment: '', err: '', saving: false });

  function open() { setF({ name: '', accountId: accounts[0]?.id || '', amount: '', date: today(), comment: '', err: '', saving: false }); setModal(true); }
  async function save() {
    const amount = Number(f.amount) || 0;
    if (amount <= 0) { setF(s => ({ ...s, err: 'Сумма больше 0' })); return; }
    if (!f.accountId) { setF(s => ({ ...s, err: 'Выберите счёт' })); return; }
    setF(s => ({ ...s, saving: true, err: '' }));
    try {
      await apiSend('/api/v2/finance', 'POST', { opType: 'Приход', accountId: f.accountId, amount, name: (f.name.trim() || 'Поступление') + (sec.key === 'other' ? '' : ' · ' + sec.label), source: 'Счета', opDate: f.date, comment: f.comment || null });
      setModal(false); await mutate(); toast('✅ Поступление проведено');
    } catch (e) { setF(s => ({ ...s, err: (e as Error).message, saving: false })); }
  }

  return (
    <div>
      <PageTitle title="Счета — поступления" sub={`${sec.label} · всего: ${fmt(total)}`} action={<Button onClick={open}>+ Поступление</Button>} />
      <Card className="erp-filters">
        <div className="erp-chips">{SECTIONS.map(s => <button key={s.key} className={`erp-chip${section === s.key ? ' on' : ''}`} style={section === s.key ? { background: s.color, borderColor: s.color, color: '#fff' } : undefined} onClick={() => setSection(s.key)}>№{s.no} {s.label}</button>)}</div>
      </Card>
      <Card style={{ marginTop: 12, padding: 0, overflowX: 'auto' }}>
        {error ? <EmptyRow>Нет доступа к финансам.</EmptyRow> : isLoading ? <EmptyRow>Загрузка…</EmptyRow> : income.length === 0 ? <EmptyRow>Поступлений нет. Нажмите «+ Поступление».</EmptyRow> : (
          <table className="erp-table">
            <thead><tr><th>Дата</th><th>Назначение</th><th>Счёт</th><th style={{ textAlign: 'right' }}>Сумма</th></tr></thead>
            <tbody>{income.map(o => <tr key={o.id}><td className="erp-muted" style={{ fontSize: 12 }}>{dmy(o.opDate)}</td><td className="erp-td-main">{o.name}</td><td style={{ fontSize: 12 }}>{o.accountName || accounts.find(a => a.id === o.accountId)?.name || '—'}</td><td style={{ textAlign: 'right', fontWeight: 700, color: '#16a34a' }}>+{fmt(o.amount)}</td></tr>)}</tbody>
          </table>
        )}
      </Card>
      <Modal open={modal} onClose={() => setModal(false)} title={`➕ Поступление · ${sec.label}`}
        footer={<><Button onClick={save} disabled={f.saving}>{f.saving ? '…' : 'Провести'}</Button><Button variant="outline" onClick={() => setModal(false)}>Отмена</Button></>}>
        {f.err && <div className="erp-form-err">{f.err}</div>}
        <Field label="Плательщик / назначение">
          <Select value="" onChange={e => { const c = (clients || []).find(x => x.id === e.target.value); if (c) setF(s => ({ ...s, name: c.name })); }}><option value="">— из клиентов или впишите —</option>{(clients || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
          <Input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder={sec.key === 'other' ? 'Проект / Тендер / Услуга…' : 'ФИО / название'} style={{ marginTop: 6 }} />
        </Field>
        <div className="erp-form-row"><Field label="Сумма (₸)" required><Input type="number" value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} /></Field><Field label="Дата"><Input type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></Field></div>
        <Field label="Счёт зачисления" required><Select value={f.accountId} onChange={e => setF({ ...f, accountId: e.target.value })}><option value="">— выберите —</option>{accounts.map((a, i) => <option key={a.id} value={a.id}>№{i + 1} {a.icon} {a.name}</option>)}</Select></Field>
        <Field label="Комментарий"><Input value={f.comment} onChange={e => setF({ ...f, comment: e.target.value })} /></Field>
      </Modal>
    </div>
  );
}

export default function InvoicesPage() {
  return <React.Suspense fallback={<div className="erp-muted" style={{ padding: 20 }}>Загрузка…</div>}><InvoicesInner /></React.Suspense>;
}
