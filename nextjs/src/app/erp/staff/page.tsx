'use client';
import * as React from 'react';
import { useApi, apiSend, apiFetch } from '@/lib/api';
import { toast } from '@/lib/toast';
import { Card, Badge, Button, PageTitle, Modal, Field, Input, Select, EmptyRow } from '@/components/ui';

type Emp = { userId: string; name: string; position?: string | null; role: string; branchName?: string | null; fixedSalary: number | null; paidThisMonth: number | null; remaining: number | null; advanceIn: number | null; salaryHidden?: boolean };
type Cand = { id: string; name: string; position?: string | null };
type Me = { role: string };
type Acct = { id: string; name: string; icon?: string | null };

const ROLE: Record<string, string> = { admin: 'Админ', director: 'Директор', accountant: 'Бухгалтер', manager: 'Менеджер', master: 'Мастер' };
const fmt = (n: number | null | undefined) => (Number(n) || 0).toLocaleString('ru-RU') + ' ₸';
const MONTHS = ['', 'январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const monthLabel = (m?: string) => { if (!m) return ''; const [y, mo] = m.split('-').map(Number); return `${MONTHS[mo] || ''} ${y}`; };

export default function StaffPage() {
  const { data: me } = useApi<Me>('/api/v2/me');
  const { data, error, isLoading, mutate } = useApi<{ month: string; employees: Emp[] }>('/api/v2/employees');
  const { data: fin } = useApi<{ accounts: Acct[] }>('/api/v2/finance');
  const accounts = fin?.accounts || [];
  const canEdit = me ? ['admin', 'accountant'].includes(me.role) : false;
  const employees = data?.employees || [];

  const [add, setAdd] = React.useState<{ open: boolean; cands: Cand[]; userId: string; salary: string; err: string; saving: boolean }>({ open: false, cands: [], userId: '', salary: '', err: '', saving: false });
  const [edit, setEdit] = React.useState<{ open: boolean; e: Emp | null; salary: string; err: string; saving: boolean }>({ open: false, e: null, salary: '', err: '', saving: false });
  const [pay, setPay] = React.useState<{ open: boolean; e: Emp | null; amount: string; accountId: string; kind: string; comment: string; err: string; saving: boolean }>({ open: false, e: null, amount: '', accountId: '', kind: 'salary', comment: '', err: '', saving: false });

  async function openAdd() {
    setAdd(a => ({ ...a, open: true, userId: '', salary: '', err: '', saving: false }));
    try { const cands = await apiFetch<Cand[]>('/api/v2/employees/candidates'); setAdd(a => ({ ...a, cands })); } catch { /* */ }
  }
  async function saveAdd() {
    if (!add.userId) { setAdd(a => ({ ...a, err: 'Выберите пользователя' })); return; }
    if (!(Number(add.salary) > 0)) { setAdd(a => ({ ...a, err: 'Оклад больше 0' })); return; }
    setAdd(a => ({ ...a, saving: true, err: '' }));
    try { await apiSend('/api/v2/employees', 'POST', { userId: add.userId, fixedSalary: Number(add.salary) }); setAdd(a => ({ ...a, open: false })); await mutate(); toast('✅ Сотрудник добавлен'); }
    catch (e) { setAdd(a => ({ ...a, err: (e as Error).message, saving: false })); }
  }
  async function saveEdit() {
    if (!edit.e) return;
    setEdit(s => ({ ...s, saving: true, err: '' }));
    try { await apiSend(`/api/v2/employees/${edit.e.userId}`, 'PATCH', { fixedSalary: Number(edit.salary) || 0 }); setEdit(s => ({ ...s, open: false })); await mutate(); toast('✅ Оклад обновлён'); }
    catch (e) { setEdit(s => ({ ...s, err: (e as Error).message, saving: false })); }
  }
  async function remove(e: Emp) {
    if (!confirm(`Убрать «${e.name}» из кадрового учёта? История выплат сохранится.`)) return;
    try { await apiSend(`/api/v2/employees/${e.userId}`, 'DELETE'); await mutate(); toast('🗑️ Убран из кадров'); }
    catch (er) { toast('⚠️ ' + (er as Error).message); }
  }
  async function savePay() {
    if (!pay.e) return;
    const amount = Number(pay.amount) || 0;
    if (amount <= 0) { setPay(p => ({ ...p, err: 'Сумма больше 0' })); return; }
    if (!pay.accountId) { setPay(p => ({ ...p, err: 'Выберите счёт списания' })); return; }
    setPay(p => ({ ...p, saving: true, err: '' }));
    const url = `/api/v2/employees/${pay.e.userId}/payments`;
    const body: Record<string, unknown> = { amount, accountId: pay.accountId, kind: pay.kind, comment: pay.comment || null, confirmOverpay: false };
    try {
      let r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (r.status === 409) {
        const e = await r.json().catch(() => ({}));
        if (!confirm((e.error || 'Оклад за месяц уже выплачен.') + '\n\nПровести превышение как аванс следующего месяца?')) { setPay(p => ({ ...p, saving: false })); return; }
        body.confirmOverpay = true;
        r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      }
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || ('HTTP ' + r.status)); }
      setPay(p => ({ ...p, open: false })); await mutate(); toast('✅ Выплата проведена (Расход в финансах)');
    } catch (e) { setPay(p => ({ ...p, err: (e as Error).message, saving: false })); }
  }

  const dots = <span style={{ color: '#9ca3af', letterSpacing: 2 }} title="Скрыто">•••</span>;

  return (
    <div>
      <PageTitle title="Зарплата и кадры" sub={`Сотрудники = пользователи системы · ${monthLabel(data?.month)}`} action={canEdit ? <Button onClick={openAdd}>+ Добавить сотрудника</Button> : undefined} />

      <Card style={{ padding: 0, overflowX: 'auto' }}>
        {error ? <EmptyRow>Нет доступа к разделу.</EmptyRow> : isLoading ? <EmptyRow>Загрузка…</EmptyRow>
          : employees.length === 0 ? <EmptyRow>Сотрудников нет.{canEdit ? ' Нажмите «+ Добавить сотрудника».' : ''}</EmptyRow>
          : (
            <table className="erp-table">
              <thead><tr><th>ФИО</th><th>Должность</th><th>Роль</th><th>Филиал</th><th style={{ textAlign: 'right' }}>Оклад</th><th style={{ textAlign: 'right' }}>Выплачено</th><th style={{ textAlign: 'right' }}>Остаток</th><th style={{ textAlign: 'right' }}>Действия</th></tr></thead>
              <tbody>
                {employees.map(e => (
                  <tr key={e.userId}>
                    <td className="erp-td-main">{e.name}</td>
                    <td className="erp-muted" style={{ fontSize: 12 }}>{e.position || '—'}</td>
                    <td><Badge tone={e.role === 'director' || e.role === 'admin' ? 'info' : 'neutral'}>{ROLE[e.role] || e.role}</Badge></td>
                    <td style={{ fontSize: 12 }}>{e.branchName || '—'}</td>
                    <td style={{ textAlign: 'right' }}>{e.salaryHidden ? dots : fmt(e.fixedSalary)}</td>
                    <td style={{ textAlign: 'right' }}>{e.salaryHidden ? dots : <>{fmt(e.paidThisMonth)}{!e.salaryHidden && Number(e.advanceIn) > 0 && <div style={{ fontSize: 10, color: '#2563eb' }}>вкл. аванс {fmt(e.advanceIn)}</div>}</>}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{e.salaryHidden ? dots : Number(e.remaining) > 0 ? <span style={{ color: '#b45309' }}>{fmt(e.remaining)}</span> : <span style={{ color: '#059669' }}>✓ выплачен</span>}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {e.salaryHidden ? <span className="erp-muted" style={{ fontSize: 11 }}>скрыто</span> : canEdit ? <>
                        <Button variant="outline" onClick={() => setPay({ open: true, e, amount: String(e.remaining || 0), accountId: '', kind: 'salary', comment: '', err: '', saving: false })} style={{ fontSize: 12, padding: '4px 8px' }}>Выплатить</Button>
                        <button className="erp-icon-btn" title="Оклад" onClick={() => setEdit({ open: true, e, salary: String(e.fixedSalary || 0), err: '', saving: false })}>✏️</button>
                        <button className="erp-icon-btn" title="Убрать" style={{ color: '#dc2626' }} onClick={() => remove(e)}>🗑️</button>
                      </> : <span className="erp-muted">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </Card>

      <Modal open={add.open} onClose={() => setAdd(a => ({ ...a, open: false }))} title="➕ Добавить сотрудника"
        footer={<><Button onClick={saveAdd} disabled={add.saving}>{add.saving ? '…' : 'Добавить'}</Button><Button variant="outline" onClick={() => setAdd(a => ({ ...a, open: false }))}>Отмена</Button></>}>
        {add.err && <div className="erp-form-err">{add.err}</div>}
        <Field label="Пользователь" required><Select value={add.userId} onChange={e => setAdd(a => ({ ...a, userId: e.target.value }))}><option value="">{add.cands.length ? '— выберите —' : '— все добавлены —'}</option>{add.cands.map(c => <option key={c.id} value={c.id}>{c.name}{c.position ? ' · ' + c.position : ''}</option>)}</Select></Field>
        <Field label="Оклад (₸/мес)" required><Input type="number" value={add.salary} onChange={e => setAdd(a => ({ ...a, salary: e.target.value }))} placeholder="200000" /></Field>
      </Modal>

      <Modal open={edit.open} onClose={() => setEdit(s => ({ ...s, open: false }))} title={`✏️ Оклад — ${edit.e?.name || ''}`}
        footer={<><Button onClick={saveEdit} disabled={edit.saving}>{edit.saving ? '…' : 'Сохранить'}</Button><Button variant="outline" onClick={() => setEdit(s => ({ ...s, open: false }))}>Отмена</Button></>}>
        {edit.err && <div className="erp-form-err">{edit.err}</div>}
        <Field label="Оклад (₸/мес)"><Input type="number" value={edit.salary} onChange={e => setEdit(s => ({ ...s, salary: e.target.value }))} /></Field>
      </Modal>

      <Modal open={pay.open} onClose={() => setPay(p => ({ ...p, open: false }))} title={`💵 Выплата — ${pay.e?.name || ''}`}
        footer={<><Button onClick={savePay} disabled={pay.saving}>{pay.saving ? '…' : 'Провести'}</Button><Button variant="outline" onClick={() => setPay(p => ({ ...p, open: false }))}>Отмена</Button></>}>
        {pay.err && <div className="erp-form-err">{pay.err}</div>}
        {pay.e && <div className="erp-muted" style={{ fontSize: 12, marginBottom: 10 }}>Оклад: <b>{fmt(pay.e.fixedSalary)}</b> · Выплачено: <b>{fmt(pay.e.paidThisMonth)}</b> · Остаток: <b style={{ color: '#b45309' }}>{fmt(pay.e.remaining)}</b></div>}
        <div className="erp-form-row">
          <Field label="Сумма (₸)" required><Input type="number" value={pay.amount} onChange={e => setPay(p => ({ ...p, amount: e.target.value }))} /></Field>
          <Field label="Тип"><Select value={pay.kind} onChange={e => setPay(p => ({ ...p, kind: e.target.value }))}><option value="salary">Зарплата</option><option value="advance">Аванс</option></Select></Field>
        </div>
        <Field label="Счёт списания" required><Select value={pay.accountId} onChange={e => setPay(p => ({ ...p, accountId: e.target.value }))}><option value="">— выберите счёт —</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}</Select></Field>
        <Field label="Комментарий"><Input value={pay.comment} onChange={e => setPay(p => ({ ...p, comment: e.target.value }))} /></Field>
      </Modal>
    </div>
  );
}
