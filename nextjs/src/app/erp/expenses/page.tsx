'use client';
import * as React from 'react';
import { useApi, apiSend } from '@/lib/api';
import { toast } from '@/lib/toast';
import { Card, Button, PageTitle, Modal, Field, Input, Select, EmptyRow } from '@/components/ui';

type Op = { id: string; opType: string; amount: string | number; opDate?: string | null; name?: string | null; accountName?: string | null; accountId: string; source?: string | null; comment?: string | null };
type Acct = { id: string; name: string; icon?: string | null; section?: string | null; sortOrder?: number | null };
type Cat = { id: string; name: string; icon?: string | null; base?: boolean; subs?: { id: string; name: string }[] };
type Emp = { userId: string; name: string; salaryHidden?: boolean };

const SECTIONS = [{ key: 'poverka', no: 1, label: 'Поверка' }, { key: 'sale', no: 2, label: 'Продажа' }, { key: 'branch', no: 3, label: 'Филиалы' }, { key: 'other', no: 4, label: 'Прочие операции' }];
const fmt = (n: number | string) => (Number(n) || 0).toLocaleString('ru-RU') + ' ₸';
const dmy = (d?: string | null) => (d ? String(d).slice(0, 10).split('-').reverse().join('.') : '—');
const today = () => new Date().toISOString().slice(0, 10);

export default function ExpensesPage() {
  const { data: fin, error, isLoading, mutate } = useApi<{ accounts: Acct[]; operations: Op[] }>('/api/v2/finance');
  const { data: cats, mutate: mutateCats } = useApi<Cat[]>('/api/v2/expense-categories');
  const { data: emp } = useApi<{ employees: Emp[] }>('/api/v2/employees');
  const accounts = fin?.accounts || [];
  const expenses = (fin?.operations || []).filter(o => o.opType === 'Расход');

  const [filter, setFilter] = React.useState('all');
  const list = expenses.filter(o => filter === 'all' || (filter === 'salary' ? o.source === 'Зарплата' : o.source !== 'Зарплата'));
  const salaryCount = expenses.filter(o => o.source === 'Зарплата').length;

  const [modal, setModal] = React.useState(false);
  const [catModal, setCatModal] = React.useState(false);
  const [newCat, setNewCat] = React.useState('');
  const [f, setF] = React.useState({ catId: '', employeeId: '', section: 'other', accountId: '', amount: '', desc: '', comment: '', date: today(), err: '', saving: false });
  const cat = (cats || []).find(c => c.id === f.catId);
  const isSalary = cat?.name === 'Зарплата';
  const secAccounts = accounts.filter(a => (a.section || 'other') === f.section).sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0));

  function open() { setF({ catId: (cats || [])[0]?.id || '', employeeId: '', section: 'other', accountId: '', amount: '', desc: '', comment: '', date: today(), err: '', saving: false }); setModal(true); }

  async function save() {
    const amount = Number(f.amount) || 0;
    if (amount <= 0) { setF(s => ({ ...s, err: 'Сумма больше 0' })); return; }
    if (!f.accountId) { setF(s => ({ ...s, err: isSalary ? 'Выберите счёт списания' : 'Выберите счёт оплаты' })); return; }
    if (isSalary && !f.employeeId) { setF(s => ({ ...s, err: 'Выберите сотрудника' })); return; }
    setF(s => ({ ...s, saving: true, err: '' }));
    try {
      if (isSalary) {
        const url = `/api/v2/employees/${f.employeeId}/payments`;
        const body: Record<string, unknown> = { amount, accountId: f.accountId, kind: 'salary', comment: f.desc || null, confirmOverpay: false };
        let r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (r.status === 409) { const e = await r.json().catch(() => ({})); if (!confirm((e.error || 'Оклад выплачен.') + '\n\nПровести как аванс?')) { setF(s => ({ ...s, saving: false })); return; } body.confirmOverpay = true; r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
        if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || ('HTTP ' + r.status)); }
      } else {
        const name = (cat?.name || 'Расход') + (f.desc ? ': ' + f.desc : '');
        await apiSend('/api/v2/finance', 'POST', { opType: 'Расход', accountId: f.accountId, amount, name, source: 'Расходы', opDate: f.date, comment: f.comment || null });
      }
      setModal(false); await mutate(); toast('✅ Расход проведён');
    } catch (e) { setF(s => ({ ...s, err: (e as Error).message, saving: false })); }
  }
  async function addCat() { if (!newCat.trim()) return; try { await apiSend('/api/v2/expense-categories', 'POST', { name: newCat.trim() }); setNewCat(''); await mutateCats(); toast('✅ Категория добавлена'); } catch (e) { toast('⚠️ ' + (e as Error).message); } }
  async function delCat(c: Cat) { if (c.base) { toast('⚠️ Базовую нельзя'); return; } if (!confirm(`Удалить категорию «${c.name}»?`)) return; try { await apiSend(`/api/v2/expense-categories/${c.id}`, 'DELETE'); await mutateCats(); toast('🗑️ Удалено'); } catch (e) { toast('⚠️ ' + (e as Error).message); } }

  return (
    <div>
      <PageTitle title="Расходы" sub="Журнал расходов = реальные операции из Финансов" action={<div style={{ display: 'flex', gap: 8 }}><Button variant="outline" onClick={() => setCatModal(true)}>Категории</Button><Button onClick={open}>+ Расход</Button></div>} />

      <Card className="erp-filters"><div className="erp-chips">
        <button className={`erp-chip${filter === 'all' ? ' on' : ''}`} onClick={() => setFilter('all')}>Все ({expenses.length})</button>
        <button className={`erp-chip${filter === 'salary' ? ' on' : ''}`} onClick={() => setFilter('salary')}>👤 Зарплата ({salaryCount})</button>
        <button className={`erp-chip${filter === 'other' ? ' on' : ''}`} onClick={() => setFilter('other')}>📄 Прочие ({expenses.length - salaryCount})</button>
      </div></Card>

      <Card style={{ marginTop: 12, padding: 0, overflowX: 'auto' }}>
        {error ? <EmptyRow>Нет доступа к финансам.</EmptyRow> : isLoading ? <EmptyRow>Загрузка…</EmptyRow> : list.length === 0 ? <EmptyRow>Расходов нет. Нажмите «+ Расход».</EmptyRow> : (
          <table className="erp-table">
            <thead><tr><th>Дата</th><th>Категория</th><th>Назначение</th><th>Счёт</th><th style={{ textAlign: 'right' }}>Сумма</th></tr></thead>
            <tbody>{list.map(o => (
              <tr key={o.id}><td className="erp-muted" style={{ fontSize: 12 }}>{dmy(o.opDate)}</td><td>{o.source === 'Зарплата' ? '👤 Зарплата' : '📄 Прочие'}</td><td className="erp-td-main">{o.name}</td><td style={{ fontSize: 12 }}>{o.accountName || accounts.find(a => a.id === o.accountId)?.name || '—'}</td><td style={{ textAlign: 'right', fontWeight: 700, color: '#dc2626' }}>−{fmt(o.amount)}</td></tr>
            ))}</tbody>
          </table>
        )}
      </Card>

      <Modal open={modal} onClose={() => setModal(false)} title="➕ Добавить расход" width={560}
        footer={<><Button onClick={save} disabled={f.saving}>{f.saving ? '…' : 'Провести'}</Button><Button variant="outline" onClick={() => setModal(false)}>Отмена</Button></>}>
        {f.err && <div className="erp-form-err">{f.err}</div>}
        <div className="erp-form-row">
          <Field label="Категория"><Select value={f.catId} onChange={e => setF({ ...f, catId: e.target.value })}>{(cats || []).map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}</Select></Field>
          <Field label="Сумма (₸)" required><Input type="number" value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} /></Field>
        </div>
        {isSalary ? (
          <Field label="Сотрудник (получатель)" required><Select value={f.employeeId} onChange={e => setF({ ...f, employeeId: e.target.value })}><option value="">— выберите —</option>{(emp?.employees || []).filter(e => !e.salaryHidden).map(e => <option key={e.userId} value={e.userId}>{e.name}</option>)}</Select></Field>
        ) : (
          <div className="erp-form-row">
            <Field label="Раздел"><Select value={f.section} onChange={e => setF({ ...f, section: e.target.value, accountId: '' })}>{SECTIONS.map(s => <option key={s.key} value={s.key}>№{s.no} {s.label}</option>)}</Select></Field>
            <Field label="Счёт оплаты" required><Select value={f.accountId} onChange={e => setF({ ...f, accountId: e.target.value })}><option value="">— выберите —</option>{secAccounts.map((a, i) => <option key={a.id} value={a.id}>№{i + 1} {a.icon} {a.name}</option>)}</Select></Field>
          </div>
        )}
        {isSalary && <Field label="Счёт списания" required><Select value={f.accountId} onChange={e => setF({ ...f, accountId: e.target.value })}><option value="">— выберите счёт —</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}</Select></Field>}
        <div className="erp-form-row">
          <Field label="Описание"><Input value={f.desc} onChange={e => setF({ ...f, desc: e.target.value })} placeholder="необязательно" /></Field>
          <Field label="Дата"><Input type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></Field>
        </div>
        <div className="erp-muted" style={{ fontSize: 11 }}>Ответственный: текущий пользователь. {isSalary ? 'Выплата идёт через кадры (контроль переплаты).' : 'Расход ложится в раздел выбранного счёта.'}</div>
      </Modal>

      <Modal open={catModal} onClose={() => setCatModal(false)} title="🏷 Категории расходов" width={440} footer={<Button variant="outline" onClick={() => setCatModal(false)}>Закрыть</Button>}>
        <div className="erp-cat-add"><Input placeholder="Новая категория" value={newCat} onChange={e => setNewCat(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addCat(); }} /><Button onClick={addCat}>Добавить</Button></div>
        <div style={{ marginTop: 12 }}>{(cats || []).map(c => <div className="erp-cat-row" key={c.id}><span style={{ flex: 1 }}>{c.icon} {c.name}{c.base && <span className="erp-muted" style={{ fontSize: 11 }}> · базовая</span>}</span>{!c.base && <button className="erp-icon-btn" style={{ color: '#dc2626' }} onClick={() => delCat(c)}>🗑️</button>}</div>)}</div>
      </Modal>
    </div>
  );
}
