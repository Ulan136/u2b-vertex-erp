'use client';
import * as React from 'react';
import { formatDate } from '@/lib/format';
import { useApi, apiSend } from '@/lib/api';
import { toast } from '@/lib/toast';
import { Card, Button, PageTitle, Modal, Field, Input, Select, EmptyRow } from '@/components/ui';
import { isRealIncome, isRealExpense } from '@/server/dto/finance.dto';

type Acct = { id: string; name: string; category?: string | null; section?: string | null; icon?: string | null; balance?: string | number | null; sortOrder?: number | null };
type Op = { id: string; opType: string; accountId: string; accountName?: string | null; amount: string | number; opDate?: string | null; name?: string | null; reverses?: string | null; reversedAt?: string | null; createdByName?: string | null };

const SECTIONS = [
  { key: 'poverka', no: 1, label: 'Поверка', icon: '📋', color: '#2563eb' },
  { key: 'sale', no: 2, label: 'Продажа', icon: '💰', color: '#d97706' },
  { key: 'branch', no: 3, label: 'Филиалы', icon: '🏢', color: '#0d9488' },
  { key: 'other', no: 4, label: 'Прочие операции', icon: '📄', color: '#6f42c1' },
];
const fmt = (n: number | string) => Math.round(Number(n) || 0).toLocaleString('ru-RU') + ' ₸';
const dmy = (d?: string | null) => formatDate(d);
const today = () => new Date().toISOString().slice(0, 10);

export default function FinancePage() {
  const [cat, setCat] = React.useState('all');
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const qs = new URLSearchParams(); if (from) qs.set('from', from); if (to) qs.set('to', to);
  const { data, error, isLoading, mutate } = useApi<{ accounts: Acct[]; operations: Op[] }>('/api/v2/finance' + (qs.toString() ? '?' + qs : ''));
  const accounts = data?.accounts || [];
  const ops = data?.operations || [];
  const secOf = (id: string) => accounts.find(a => a.id === id)?.section || 'other';
  const cats = cat === 'all' ? SECTIONS.map(s => s.key) : [cat];

  const [opModal, setOpModal] = React.useState(false);
  const [op, setOp] = React.useState({ type: 'Приход', accountId: '', toAccountId: '', amount: '', name: '', date: today(), err: '', saving: false });
  const [acctModal, setAcctModal] = React.useState(false);
  const [acc, setAcc] = React.useState({ name: '', category: 'kaspi', section: 'poverka', icon: '💳', balance: '', err: '', saving: false });

  const sortAccs = (list: Acct[]) => [...list].sort((a, b) => (Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0)) || String(a.name).localeCompare(String(b.name)));

  const visAccs = accounts.filter(a => cats.includes(a.section || 'other'));
  const visOps = ops.filter(o => cats.includes(secOf(o.accountId)));
  const cash = visAccs.reduce((s, a) => s + (Number(a.balance) || 0), 0);
  const income = visOps.filter(isRealIncome).reduce((s, o) => s + (Number(o.amount) || 0), 0);
  const expense = visOps.filter(isRealExpense).reduce((s, o) => s + (Number(o.amount) || 0), 0);

  async function saveOp() {
    const amt = Number(op.amount) || 0;
    if (amt <= 0) { setOp(o => ({ ...o, err: 'Введите сумму' })); return; }
    if (!op.accountId) { setOp(o => ({ ...o, err: 'Выберите счёт' })); return; }
    if (op.type === 'Перевод' && (!op.toAccountId || op.toAccountId === op.accountId)) { setOp(o => ({ ...o, err: 'Выберите разные счета' })); return; }
    setOp(o => ({ ...o, saving: true, err: '' }));
    const body: Record<string, unknown> = { opType: op.type, accountId: op.accountId, amount: amt, name: op.name.trim() || op.type, opDate: op.date };
    if (op.type === 'Перевод') { body.toAccountId = op.toAccountId; body.name = 'Перевод: ' + (op.name.trim() || ''); }
    try { await apiSend('/api/v2/finance', 'POST', body); setOpModal(false); await mutate(); toast('✅ Операция сохранена'); }
    catch (e) { setOp(o => ({ ...o, err: (e as Error).message, saving: false })); }
  }
  async function saveAcct() {
    if (!acc.name.trim()) { setAcc(a => ({ ...a, err: 'Введите название' })); return; }
    setAcc(a => ({ ...a, saving: true, err: '' }));
    try { await apiSend('/api/v2/finance/accounts', 'POST', { name: acc.name.trim(), category: acc.category, section: acc.section, icon: acc.icon || null, balance: Number(acc.balance) || 0 }); setAcctModal(false); await mutate(); toast('✅ Счёт создан'); }
    catch (e) { setAcc(a => ({ ...a, err: (e as Error).message, saving: false })); }
  }

  return (
    <div>
      <PageTitle title="Финансы" sub="Счета и операции по разделам" action={
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="outline" onClick={() => { setAcc({ name: '', category: 'kaspi', section: cat === 'all' ? 'poverka' : cat, icon: '💳', balance: '', err: '', saving: false }); setAcctModal(true); }}>+ Счёт</Button>
          <Button onClick={() => { setOp({ type: 'Приход', accountId: '', toAccountId: '', amount: '', name: '', date: today(), err: '', saving: false }); setOpModal(true); }}>+ Операция</Button>
        </div>} />

      <Card className="erp-filters">
        <div className="erp-chips">
          <button className={`erp-chip${cat === 'all' ? ' on' : ''}`} onClick={() => setCat('all')}>Все</button>
          {SECTIONS.map(s => <button key={s.key} className={`erp-chip${cat === s.key ? ' on' : ''}`} style={cat === s.key ? { background: s.color, borderColor: s.color, color: '#fff' } : undefined} onClick={() => setCat(s.key)}>№{s.no} {s.icon} {s.label}</button>)}
        </div>
        <label className="erp-check">с <Input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ width: 150 }} /></label>
        <label className="erp-check">по <Input type="date" value={to} onChange={e => setTo(e.target.value)} style={{ width: 150 }} /></label>
      </Card>

      <div className="erp-kpi-grid" style={{ marginTop: 12 }}>
        <div className="erp-kpi"><div className="erp-kpi-top"><span className="erp-kpi-ico">💳</span><span className="erp-kpi-label">Касса</span></div><div className="erp-kpi-val">{fmt(cash)}</div></div>
        <div className="erp-kpi"><div className="erp-kpi-top"><span className="erp-kpi-ico">📥</span><span className="erp-kpi-label">Приход за период</span></div><div className="erp-kpi-val" style={{ color: '#16a34a' }}>{fmt(income)}</div></div>
        <div className="erp-kpi"><div className="erp-kpi-top"><span className="erp-kpi-ico">📤</span><span className="erp-kpi-label">Расход за период</span></div><div className="erp-kpi-val" style={{ color: '#dc2626' }}>{fmt(expense)}</div></div>
      </div>

      {error ? <Card><EmptyRow>Нет доступа к финансам.</EmptyRow></Card> : isLoading ? <Card><EmptyRow>Загрузка…</EmptyRow></Card> : (
        <div className="erp-fin-cols">
          {cats.map(c => {
            const sec = SECTIONS.find(s => s.key === c)!;
            const accs = sortAccs(accounts.filter(a => (a.section || 'other') === c));
            const total = accs.reduce((s, a) => s + (Number(a.balance) || 0), 0);
            const movs = ops.filter(o => secOf(o.accountId) === c).sort((a, b) => String(b.opDate).localeCompare(String(a.opDate)));
            return (
              <div className="erp-fin-col" key={c}>
                <div className="erp-fin-head" style={{ background: sec.color }}><span>№{sec.no} {sec.icon} {sec.label}</span><span>{fmt(total)}</span></div>
                <div className="erp-fin-accs">
                  {accs.length === 0 ? <div className="erp-muted" style={{ fontSize: 12, padding: 6 }}>Нет счетов</div> : accs.map((a, i) => (
                    <div className="erp-fin-acc" key={a.id}><span><b>№{i + 1}</b> {a.icon} {a.name}</span><span>{fmt(a.balance || 0)}</span></div>
                  ))}
                </div>
                <div className="erp-fin-movs">
                  <div className="erp-fin-movh">Движения · {movs.length}</div>
                  {movs.length === 0 ? <div className="erp-muted" style={{ fontSize: 12 }}>Нет движений</div> : movs.slice(0, 30).map(o => (
                    <div className="erp-fin-mov" key={o.id}>
                      <span className="erp-fin-movd">{dmy(o.opDate)}</span>
                      <span className="erp-fin-movt">{o.name}{o.createdByName ? <span className="erp-muted" style={{ marginLeft: 6, fontSize: 10 }}>· {o.createdByName}</span> : null}</span>
                      <span style={{ color: o.opType === 'Приход' ? '#16a34a' : '#dc2626', fontWeight: 700, whiteSpace: 'nowrap' }}>{o.opType === 'Приход' ? '+' : '−'}{fmt(o.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={opModal} onClose={() => setOpModal(false)} title="➕ Операция"
        footer={<><Button onClick={saveOp} disabled={op.saving}>{op.saving ? 'Сохранение…' : 'Провести'}</Button><Button variant="outline" onClick={() => setOpModal(false)}>Отмена</Button></>}>
        {op.err && <div className="erp-form-err">{op.err}</div>}
        <div className="erp-chips" style={{ marginBottom: 12 }}>
          {['Приход', 'Расход', 'Перевод'].map(t => <button key={t} className={`erp-chip${op.type === t ? ' on' : ''}`} onClick={() => setOp(o => ({ ...o, type: t }))}>{t}</button>)}
        </div>
        <Field label={op.type === 'Перевод' ? 'Со счёта' : 'Счёт'} required>
          <Select value={op.accountId} onChange={e => setOp(o => ({ ...o, accountId: e.target.value }))}><option value="">— выберите —</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.icon} {a.name} · {SECTIONS.find(s => s.key === a.section)?.label}</option>)}</Select>
        </Field>
        {op.type === 'Перевод' && <Field label="На счёт" required><Select value={op.toAccountId} onChange={e => setOp(o => ({ ...o, toAccountId: e.target.value }))}><option value="">— выберите —</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.icon} {a.name} · {SECTIONS.find(s => s.key === a.section)?.label}</option>)}</Select></Field>}
        <div className="erp-form-row">
          <Field label="Сумма (₸)" required><Input type="number" min={0} value={op.amount} onChange={e => setOp(o => ({ ...o, amount: e.target.value }))} /></Field>
          <Field label="Дата"><Input type="date" value={op.date} onChange={e => setOp(o => ({ ...o, date: e.target.value }))} /></Field>
        </div>
        <Field label="Назначение"><Input value={op.name} onChange={e => setOp(o => ({ ...o, name: e.target.value }))} placeholder="комментарий" /></Field>
      </Modal>

      <Modal open={acctModal} onClose={() => setAcctModal(false)} title="➕ Новый счёт"
        footer={<><Button onClick={saveAcct} disabled={acc.saving}>{acc.saving ? 'Сохранение…' : 'Создать'}</Button><Button variant="outline" onClick={() => setAcctModal(false)}>Отмена</Button></>}>
        {acc.err && <div className="erp-form-err">{acc.err}</div>}
        <Field label="Название" required><Input value={acc.name} onChange={e => setAcc(a => ({ ...a, name: e.target.value }))} placeholder="напр. Каспи" /></Field>
        <div className="erp-form-row">
          <Field label="Раздел"><Select value={acc.section} onChange={e => setAcc(a => ({ ...a, section: e.target.value }))}>{SECTIONS.map(s => <option key={s.key} value={s.key}>№{s.no} {s.label}</option>)}</Select></Field>
          <Field label="Банк"><Select value={acc.category} onChange={e => setAcc(a => ({ ...a, category: e.target.value }))}><option value="kaspi">Kaspi</option><option value="bck">БЦК</option><option value="nalichka">Наличка</option><option value="other">Другое</option></Select></Field>
        </div>
        <div className="erp-form-row">
          <Field label="Иконка"><Input value={acc.icon} onChange={e => setAcc(a => ({ ...a, icon: e.target.value }))} /></Field>
          <Field label="Начальный остаток (₸)"><Input type="number" value={acc.balance} onChange={e => setAcc(a => ({ ...a, balance: e.target.value }))} /></Field>
        </div>
      </Modal>
    </div>
  );
}
