'use client';
import * as React from 'react';
import { useApi, apiSend } from '@/lib/api';
import { toast } from '@/lib/toast';
import { formatDate } from '@/lib/format';
import { Card, PageTitle, EmptyRow, DateRange, Button, Modal, Field, Input, MoneyInput, Select } from '@/components/ui';
import { opIcon, opName, opSign, opAmountColor, isReversed } from '@/lib/opDisplay';

type Acct = { id: string; name: string; icon?: string | null; section?: string | null; balance?: string | number | null };
type Op = { id: string; opType: string; accountId: string; accountName?: string | null; amount: string | number; opDate?: string | null; name?: string | null; source?: string | null; reverses?: string | null; reversedAt?: string | null; createdByName?: string | null };
type Target = { id: string; name: string; icon?: string | null; own: boolean };
type Resp = { section: string; branchId: string; accounts: Acct[]; operations: Op[]; accountNo: Record<string, number>; total: number; income: number; expense: number; transferTargets: Target[] };

const fmt = (n: number | string) => (Number(n) || 0).toLocaleString('ru-RU');
const num = (v: unknown) => Number(String(v ?? '').replace(/\s/g, '')) || 0;
const dmy = (d?: string | null) => formatDate(d);
const today = () => new Date().toISOString().slice(0, 10);

// Кабинет филиала: только свой счёт, свои движения. Компанейские данные сюда не
// приходят (изоляция на сервере — /api/v2/branch/* отдаёт лишь свой раздел).
export default function BranchFinancePage() {
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const qs = new URLSearchParams(); if (from) qs.set('from', from); if (to) qs.set('to', to);
  const { data, error, isLoading, mutate } = useApi<Resp>('/api/v2/branch/finance' + (qs.toString() ? '?' + qs : ''));
  const [tab, setTab] = React.useState<'all' | 'expense' | 'transfer' | 'income'>('all');

  const accounts = data?.accounts || [];
  const targets = data?.transferTargets || [];
  const defAcc = accounts[0]?.id || '';
  const ops = React.useMemo(() => (data?.operations || []).slice().sort((a, b) => String(b.opDate).localeCompare(String(a.opDate))), [data]);
  const accNo = data?.accountNo || {};
  const match = (o: Op) =>
    tab === 'all' ? true
      : tab === 'expense' ? o.opType === 'Расход'
      : tab === 'transfer' ? o.opType === 'Перевод'
      : o.opType === 'Приход';
  const rows = ops.filter(match);
  const counts = {
    all: ops.length,
    expense: ops.filter(o => o.opType === 'Расход').length,
    transfer: ops.filter(o => o.opType === 'Перевод').length,
    income: ops.filter(o => o.opType === 'Приход').length,
  };

  // ── Расход ──
  const emptyExp = () => ({ open: false, accountId: defAcc, amount: '', name: '', date: today(), comment: '', err: '', saving: false });
  const [exp, setExp] = React.useState(emptyExp());
  const openExp = () => setExp({ ...emptyExp(), accountId: defAcc, open: true });
  async function saveExp() {
    if (!exp.accountId) { setExp(s => ({ ...s, err: 'Выберите счёт' })); return; }
    if (num(exp.amount) <= 0) { setExp(s => ({ ...s, err: 'Укажите сумму' })); return; }
    if (!exp.name.trim()) { setExp(s => ({ ...s, err: 'Укажите назначение расхода' })); return; }
    setExp(s => ({ ...s, saving: true, err: '' }));
    try {
      await apiSend('/api/v2/branch/expense', 'POST', { accountId: exp.accountId, amount: num(exp.amount), name: exp.name.trim(), date: exp.date || null, comment: exp.comment || null });
      setExp(s => ({ ...s, open: false })); await mutate(); toast('💸 Расход проведён');
    } catch (e) { setExp(s => ({ ...s, err: (e as Error).message, saving: false })); }
  }

  // ── Перевод ──
  const emptyTr = () => ({ open: false, fromAccountId: defAcc, toAccountId: '', amount: '', name: '', date: today(), err: '', saving: false });
  const [tr, setTr] = React.useState(emptyTr());
  const openTr = () => setTr({ ...emptyTr(), fromAccountId: defAcc, open: true });
  async function saveTr() {
    if (!tr.fromAccountId) { setTr(s => ({ ...s, err: 'Выберите счёт-источник' })); return; }
    if (!tr.toAccountId) { setTr(s => ({ ...s, err: 'Выберите счёт-получатель' })); return; }
    if (tr.fromAccountId === tr.toAccountId) { setTr(s => ({ ...s, err: 'Счета должны отличаться' })); return; }
    if (num(tr.amount) <= 0) { setTr(s => ({ ...s, err: 'Укажите сумму' })); return; }
    setTr(s => ({ ...s, saving: true, err: '' }));
    try {
      await apiSend('/api/v2/branch/transfer', 'POST', { fromAccountId: tr.fromAccountId, toAccountId: tr.toAccountId, amount: num(tr.amount), name: tr.name || null, date: tr.date || null });
      setTr(s => ({ ...s, open: false })); await mutate(); toast('🔁 Перевод проведён');
    } catch (e) { setTr(s => ({ ...s, err: (e as Error).message, saving: false })); }
  }

  return (
    <div>
      <PageTitle title="Финансы филиала" sub="Ваш счёт, расходы и переводы — только по вашему филиалу" action={
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="outline" onClick={openTr} disabled={!accounts.length}>🔁 Перевод</Button>
          <Button onClick={openExp} disabled={!accounts.length}>+ Расход</Button>
        </div>} />

      <Card className="erp-filters" style={{ marginTop: 12 }}>
        <DateRange from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
      </Card>

      <div className="erp-kpi-grid" style={{ marginTop: 12 }}>
        <div className="erp-kpi"><div className="erp-kpi-top"><span className="erp-kpi-ico">💳</span><span className="erp-kpi-label">На счетах</span></div><div className="erp-kpi-val">{fmt(data?.total || 0)} ₸</div></div>
        <div className="erp-kpi"><div className="erp-kpi-top"><span className="erp-kpi-ico">📥</span><span className="erp-kpi-label">Приход за период</span></div><div className="erp-kpi-val" style={{ color: '#16a34a' }}>{fmt(data?.income || 0)} ₸</div></div>
        <div className="erp-kpi"><div className="erp-kpi-top"><span className="erp-kpi-ico">📤</span><span className="erp-kpi-label">Списано за период</span></div><div className="erp-kpi-val" style={{ color: '#dc2626' }}>{fmt(data?.expense || 0)} ₸</div></div>
      </div>

      {/* Счета филиала */}
      <Card style={{ marginTop: 12 }}>
        <h3>Мои счета</h3>
        {error ? <EmptyRow>Нет доступа к финансам филиала.</EmptyRow> : isLoading ? <EmptyRow>Загрузка…</EmptyRow>
          : accounts.length === 0 ? <EmptyRow>У филиала пока нет счетов.</EmptyRow> : (
            <div className="erp-sections" style={{ marginTop: 8 }}>
              {accounts.map(a => (
                <div className="erp-sec-row" key={a.id}>
                  <span className="erp-sec-label"><b>№{accNo[a.id]}</b> {a.icon || '💳'} {a.name}</span>
                  <span className="erp-sec-val">{fmt(a.balance || 0)} ₸</span>
                </div>
              ))}
            </div>
          )}
      </Card>

      {/* Движения */}
      <Card className="erp-journal" style={{ padding: 0, marginTop: 12 }}>
        <div className="erp-chips" style={{ padding: '10px 12px 0' }}>
          <button className={`erp-chip${tab === 'all' ? ' on' : ''}`} onClick={() => setTab('all')}>Все · {counts.all}</button>
          <button className={`erp-chip${tab === 'expense' ? ' on' : ''}`} onClick={() => setTab('expense')}>💸 Расходы · {counts.expense}</button>
          <button className={`erp-chip${tab === 'transfer' ? ' on' : ''}`} onClick={() => setTab('transfer')}>🔁 Переводы · {counts.transfer}</button>
          <button className={`erp-chip${tab === 'income' ? ' on' : ''}`} onClick={() => setTab('income')}>📥 Приходы · {counts.income}</button>
        </div>
        {isLoading ? <EmptyRow>Загрузка…</EmptyRow>
          : rows.length === 0 ? <EmptyRow>Движений нет.</EmptyRow>
          : (
            <table className="erp-table">
              <thead><tr><th className="col-date">Дата</th><th className="col-account">Счёт</th><th>Операция</th><th style={{ textAlign: 'right' }}>Сумма</th></tr></thead>
              <tbody>
                {rows.map(o => (
                  <tr key={o.id}>
                    <td className="erp-muted col-date" style={{ fontSize: 12 }}>{dmy(o.opDate)}</td>
                    <td className="erp-muted col-account" style={{ fontSize: 12 }}>№{accNo[o.accountId] ?? '?'} {o.accountName || ''}</td>
                    <td style={isReversed(o) ? { textDecoration: 'line-through', opacity: .55 } : undefined}>{opIcon(o)} {opName(o)}{o.createdByName ? <span className="erp-muted" style={{ marginLeft: 6, fontSize: 11 }}>· {o.createdByName}</span> : null}</td>
                    <td style={{ textAlign: 'right', color: opAmountColor(o), fontWeight: 700, whiteSpace: 'nowrap' }}>{opSign(o)}{fmt(o.amount)} ₸</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </Card>

      <p className="erp-muted" style={{ fontSize: 11, marginTop: 10 }}>
        Показаны только операции вашего филиала. Тратить и переводить можно только со своих счетов; перевести — на свой счёт или головному офису.
      </p>

      {/* Модалка расхода */}
      <Modal open={exp.open} onClose={() => setExp(s => ({ ...s, open: false }))} title="💸 Расход филиала"
        footer={<><Button onClick={saveExp} disabled={exp.saving}>{exp.saving ? 'Проведение…' : 'Провести расход'}</Button><Button variant="outline" onClick={() => setExp(s => ({ ...s, open: false }))}>Отмена</Button></>}>
        {exp.err && <div className="erp-form-err">{exp.err}</div>}
        <div className="erp-form-row">
          <Field label="Со счёта" required>
            <Select value={exp.accountId} onChange={e => setExp(s => ({ ...s, accountId: e.target.value }))}>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.icon || '💳'} {a.name} · {fmt(a.balance || 0)} ₸</option>)}
            </Select>
          </Field>
          <Field label="Сумма, ₸" required><MoneyInput value={exp.amount} onValue={v => setExp(s => ({ ...s, amount: v }))} placeholder="0" /></Field>
        </div>
        <Field label="Назначение" required><Input value={exp.name} onChange={e => setExp(s => ({ ...s, name: e.target.value }))} placeholder="напр. Аренда, ГСМ, канцелярия…" autoFocus /></Field>
        <div className="erp-form-row">
          <Field label="Дата"><Input type="date" value={exp.date} onChange={e => setExp(s => ({ ...s, date: e.target.value }))} /></Field>
          <Field label="Комментарий"><Input value={exp.comment} onChange={e => setExp(s => ({ ...s, comment: e.target.value }))} placeholder="необязательно" /></Field>
        </div>
      </Modal>

      {/* Модалка перевода */}
      <Modal open={tr.open} onClose={() => setTr(s => ({ ...s, open: false }))} title="🔁 Перевод"
        footer={<><Button onClick={saveTr} disabled={tr.saving}>{tr.saving ? 'Проведение…' : 'Провести перевод'}</Button><Button variant="outline" onClick={() => setTr(s => ({ ...s, open: false }))}>Отмена</Button></>}>
        {tr.err && <div className="erp-form-err">{tr.err}</div>}
        <div className="erp-form-row">
          <Field label="Со счёта" required>
            <Select value={tr.fromAccountId} onChange={e => setTr(s => ({ ...s, fromAccountId: e.target.value }))}>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.icon || '💳'} {a.name} · {fmt(a.balance || 0)} ₸</option>)}
            </Select>
          </Field>
          <Field label="На счёт" required>
            <Select value={tr.toAccountId} onChange={e => setTr(s => ({ ...s, toAccountId: e.target.value }))}>
              <option value="">— выберите —</option>
              <optgroup label="Мои счета">{targets.filter(t => t.own).map(t => <option key={t.id} value={t.id}>{t.icon || '💳'} {t.name}</option>)}</optgroup>
              <optgroup label="Головной офис">{targets.filter(t => !t.own).map(t => <option key={t.id} value={t.id}>{t.icon || '💳'} {t.name}</option>)}</optgroup>
            </Select>
          </Field>
        </div>
        <div className="erp-form-row">
          <Field label="Сумма, ₸" required><MoneyInput value={tr.amount} onValue={v => setTr(s => ({ ...s, amount: v }))} placeholder="0" /></Field>
          <Field label="Дата"><Input type="date" value={tr.date} onChange={e => setTr(s => ({ ...s, date: e.target.value }))} /></Field>
        </div>
        <Field label="Комментарий"><Input value={tr.name} onChange={e => setTr(s => ({ ...s, name: e.target.value }))} placeholder="напр. возврат головному" /></Field>
        <div className="erp-muted" style={{ fontSize: 11, marginTop: 4 }}>Перевод спишет сумму с вашего счёта и добавит на счёт-получатель. Переводить можно только со своих счетов.</div>
      </Modal>
    </div>
  );
}
