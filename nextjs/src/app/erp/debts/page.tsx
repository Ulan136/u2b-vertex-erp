'use client';
import * as React from 'react';
import { formatDate } from '@/lib/format';
import { useApi, apiSend } from '@/lib/api';
import { toast } from '@/lib/toast';
import { Card, Badge, Button, PageTitle, Modal, Field, Input, Select, EmptyRow } from '@/components/ui';

type Debt = { id: string; type: string; amount: string | number; paidAmount: string | number; status: string; clientName?: string | null; counterpartyName?: string | null; accountId?: string | null; accountName?: string | null; dueDate?: string | null; comment?: string | null; createdByName?: string | null };
type Payment = { id: string; amount: string | number; payDate?: string | null; accountId?: string | null; comment?: string | null; financeOpId?: string | null };
type Journal = { id: string; payDate?: string | null; amount: number; accountName?: string | null; author?: string | null; comment?: string | null; counterparty: string; debtType: string; debtAmount: number; remainingAfter: number };
type Acct = { id: string; name: string; icon?: string | null };
type Client = { id: string; name: string; phone?: string | null };

const num = (v: unknown) => Number(v) || 0;
const fmt = (n: number | string) => Math.round(num(n)).toLocaleString('ru-RU') + ' ₸';
const dmy = (d?: string | null) => formatDate(d) || '—';
const iso = (d?: string | null) => (d ? String(d).slice(0, 10) : '');
const today = () => new Date().toISOString().slice(0, 10);
const remaining = (d: Debt) => Math.max(0, num(d.amount) - num(d.paidAmount));
const counterparty = (d: Debt) => d.clientName || d.counterpartyName || '—';
const overdue = (d: Debt) => d.status !== 'closed' && !!d.dueDate && iso(d.dueDate) < today();
const daysLeft = (d: Debt): number | null => { if (!d.dueDate || d.status === 'closed') return null; return Math.round((new Date(iso(d.dueDate)).getTime() - new Date(today()).getTime()) / 86400000); };

// Мы должны (credit) — ПЕРВЫМ везде.
const TABS: Array<[string, string]> = [['credit', '📤 Мы должны'], ['debit', '📥 Нам должны'], ['all', 'Все'], ['journal', '🧾 Журнал оплат']];

export default function DebtsPage() {
  const [tab, setTab] = React.useState('credit');
  const [q, setQ] = React.useState('');
  const isJournal = tab === 'journal';
  const qs = new URLSearchParams(); if (tab === 'debit' || tab === 'credit') qs.set('type', tab); if (q.trim()) qs.set('q', q.trim());
  const { data: debts, error, isLoading, mutate } = useApi<Debt[]>(!isJournal ? '/api/v2/debts' + (qs.toString() ? '?' + qs : '') : null);
  const { data: all } = useApi<Debt[]>('/api/v2/debts');
  const { data: fin } = useApi<{ accounts: Acct[] }>('/api/v2/finance');
  const { data: clients } = useApi<Client[]>('/api/v2/clients');
  const accounts = fin?.accounts || [];

  const list = debts || [];
  const sumRem = (type: string) => (all || []).filter(d => d.type === type && d.status !== 'closed').reduce((s, d) => s + remaining(d), 0);
  const overdueSum = (all || []).filter(d => overdue(d)).reduce((s, d) => s + remaining(d), 0);

  // ── журнал оплат ──
  const [jFrom, setJFrom] = React.useState('');
  const [jTo, setJTo] = React.useState('');
  const jqs = new URLSearchParams(); if (jFrom) jqs.set('from', jFrom); if (jTo) jqs.set('to', jTo); if (q.trim()) jqs.set('q', q.trim());
  const { data: journal } = useApi<Journal[]>(isJournal ? '/api/v2/debts/payments' + (jqs.toString() ? '?' + jqs : '') : null);
  async function exportJournal() {
    try {
      const r = await fetch('/api/v2/debts/payments/export' + (jqs.toString() ? '?' + jqs : ''));
      if (!r.ok) throw new Error('Ошибка выгрузки');
      const b = await r.blob(); const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(b), download: 'Оплаты_по_долгам.xlsx' }); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (e) { toast('⚠️ ' + (e as Error).message); }
  }

  // ── раскрытие карточки долга ──
  const [openId, setOpenId] = React.useState<string | null>(null);
  const { data: payments } = useApi<Payment[]>(openId ? `/api/v2/debts/${openId}/payments` : null);
  const accName = (id?: string | null) => accounts.find(a => a.id === id)?.name || '—';

  // ── модалки ──
  const [modal, setModal] = React.useState(false);
  const [form, setForm] = React.useState({ type: 'credit', name: '', amount: '', paidNow: '0', accountId: '', dueDate: '', comment: '', err: '', saving: false });
  const [pay, setPay] = React.useState({ open: false, debt: null as Debt | null, amount: '', accountId: '', date: today(), comment: '', err: '', saving: false });

  function openNew() { setForm({ type: tab === 'debit' ? 'debit' : 'credit', name: '', amount: '', paidNow: '0', accountId: '', dueDate: '', comment: '', err: '', saving: false }); setModal(true); }
  async function saveDebt() {
    if (!form.name.trim()) { setForm(f => ({ ...f, err: 'Укажите контрагента' })); return; }
    const amt = num(form.amount); if (amt <= 0) { setForm(f => ({ ...f, err: 'Сумма больше 0' })); return; }
    const paid = num(form.paidNow); if (paid > amt) { setForm(f => ({ ...f, err: 'Погашено не может быть больше суммы' })); return; }
    setForm(f => ({ ...f, saving: true, err: '' }));
    try {
      await apiSend('/api/v2/debts', 'POST', { type: form.type, counterpartyName: form.name.trim(), amount: amt, paidAmount: paid, accountId: form.accountId || null, dueDate: form.dueDate || null, comment: form.comment || null });
      setModal(false); await mutate(); toast('✅ Долг добавлен');
    } catch (e) { setForm(f => ({ ...f, err: (e as Error).message, saving: false })); }
  }
  function openPay(d: Debt) { setPay({ open: true, debt: d, amount: String(remaining(d)), accountId: d.accountId || '', date: today(), comment: '', err: '', saving: false }); }
  async function savePay() {
    const d = pay.debt; if (!d) return;
    const amt = num(pay.amount); if (amt <= 0) { setPay(p => ({ ...p, err: 'Сумма больше 0' })); return; }
    if (amt > remaining(d) + 0.005) { setPay(p => ({ ...p, err: `Не больше остатка: ${fmt(remaining(d))}` })); return; }
    setPay(p => ({ ...p, saving: true, err: '' }));
    try {
      await apiSend(`/api/v2/debts/${d.id}/payments`, 'POST', { amount: amt, accountId: pay.accountId || null, payDate: pay.date || null, comment: pay.comment || null });
      setPay(p => ({ ...p, open: false })); await mutate(); toast('✅ Погашение проведено (операция в финансах)');
    } catch (e) { setPay(p => ({ ...p, err: (e as Error).message, saving: false })); }
  }
  async function removePayment(pid: string) {
    if (!confirm('Отменить платёж? Финоперация будет сторнирована, остаток вернётся.')) return;
    try { await apiSend(`/api/v2/debt-payments/${pid}`, 'DELETE'); await mutate(); toast('↩️ Платёж отменён'); }
    catch (e) { toast('⚠️ ' + (e as Error).message); }
  }
  async function removeDebt(d: Debt) {
    if (!confirm('Удалить долг? Связанные погашения/операции будут откачены.')) return;
    try { await apiSend(`/api/v2/debts/${d.id}`, 'DELETE'); await mutate(); toast('🗑️ Удалено'); }
    catch (e) { toast('⚠️ ' + (e as Error).message); }
  }

  const dueBadge = (d: Debt) => {
    const n = daysLeft(d); if (n === null) return null;
    if (n < 0) return <Badge tone="err">просрочен на {Math.abs(n)} дн</Badge>;
    if (n === 0) return <Badge tone="warn">срок сегодня</Badge>;
    return <Badge tone="neutral">осталось {n} дн</Badge>;
  };

  return (
    <div>
      <PageTitle title="Долги" sub="Кредиторка и дебиторка — по остаткам" action={<Button onClick={openNew}>+ Долг</Button>} />

      {/* Сводка: Мы должны | Нам должны | Просрочено */}
      <div className="erp-kpi-grid">
        <div className="erp-kpi"><div className="erp-kpi-top"><span className="erp-kpi-ico">📤</span><span className="erp-kpi-label">Мы должны (остаток)</span></div><div className="erp-kpi-val" style={{ color: '#dc2626' }}>{fmt(sumRem('credit'))}</div></div>
        <div className="erp-kpi"><div className="erp-kpi-top"><span className="erp-kpi-ico">📥</span><span className="erp-kpi-label">Нам должны (остаток)</span></div><div className="erp-kpi-val" style={{ color: '#16a34a' }}>{fmt(sumRem('debit'))}</div></div>
        <div className="erp-kpi"><div className="erp-kpi-top"><span className="erp-kpi-ico">⏰</span><span className="erp-kpi-label">Просрочено</span></div><div className="erp-kpi-val" style={{ color: '#b45309' }}>{fmt(overdueSum)}</div></div>
      </div>

      <Card className="erp-filters" style={{ marginTop: 12, flexWrap: 'wrap', gap: 8 }}>
        <div className="erp-chips">
          {TABS.map(([k, l]) => <button key={k} className={`erp-chip${tab === k ? ' on' : ''}`} onClick={() => { setTab(k); setOpenId(null); }}>{l}</button>)}
        </div>
        <Input placeholder="🔍 Контрагент" value={q} onChange={e => setQ(e.target.value)} />
        {isJournal && <>
          <Input type="date" value={jFrom} onChange={e => setJFrom(e.target.value)} style={{ width: 150 }} />
          <span className="erp-muted">—</span>
          <Input type="date" value={jTo} onChange={e => setJTo(e.target.value)} style={{ width: 150 }} />
          <Button variant="outline" onClick={exportJournal}>⬇ Excel</Button>
        </>}
      </Card>

      {isJournal ? (
        <Card style={{ marginTop: 12, padding: 0, overflowX: 'auto' }}>
          {!journal ? <EmptyRow>Загрузка…</EmptyRow> : journal.length === 0 ? <EmptyRow>Оплат нет.</EmptyRow> : (
            <table className="erp-table" style={{ fontSize: 13 }}>
              <thead><tr><th>Дата</th><th>Контрагент</th><th>Долг</th><th style={{ textAlign: 'right' }}>Платёж</th><th>Счёт</th><th style={{ textAlign: 'right' }}>Остаток после</th><th>Автор</th></tr></thead>
              <tbody>
                {journal.map(p => (
                  <tr key={p.id}>
                    <td className="erp-muted">{dmy(p.payDate)}</td>
                    <td className="erp-td-main">{p.debtType === 'credit' ? '📤' : '📥'} {p.counterparty}</td>
                    <td className="erp-muted" style={{ fontSize: 12 }}>{p.debtType === 'credit' ? 'Мы должны' : 'Нам должны'} · {fmt(p.debtAmount)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: p.debtType === 'credit' ? '#dc2626' : '#16a34a' }}>{fmt(p.amount)}</td>
                    <td className="erp-muted" style={{ fontSize: 12 }}>{p.accountName || '—'}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(p.remainingAfter)}</td>
                    <td className="erp-muted" style={{ fontSize: 12 }}>{p.author || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      ) : (
        <Card style={{ marginTop: 12, padding: 0, overflowX: 'auto' }}>
          {error ? <EmptyRow>Нет доступа к долгам.</EmptyRow> : isLoading ? <EmptyRow>Загрузка…</EmptyRow>
            : list.length === 0 ? <EmptyRow>Долгов нет. Нажмите «+ Долг».</EmptyRow>
            : (
              <table className="erp-table">
                <thead><tr><th>Контрагент</th><th style={{ textAlign: 'right' }}>Взято</th><th style={{ textAlign: 'right' }}>Погашено</th><th style={{ textAlign: 'right' }}>Остаток</th><th>Счёт</th><th>Срок</th><th>Статус</th><th>Автор</th><th style={{ textAlign: 'right' }}>Действия</th></tr></thead>
                <tbody>
                  {list.map(d => {
                    const rem = remaining(d); const pct = num(d.amount) > 0 ? Math.min(100, Math.round(num(d.paidAmount) / num(d.amount) * 100)) : 0;
                    return (
                      <React.Fragment key={d.id}>
                        <tr className="debt-row" onClick={() => setOpenId(openId === d.id ? null : d.id)}>
                          <td className="erp-td-main">{openId === d.id ? '▾ ' : '▸ '}{d.type === 'credit' ? '📤' : '📥'} {counterparty(d)}</td>
                          <td style={{ textAlign: 'right' }}>{fmt(d.amount)}</td>
                          <td style={{ textAlign: 'right', color: '#059669' }}>{fmt(d.paidAmount)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 800, color: rem > 0 ? '#dc2626' : '#16a34a' }}>{fmt(rem)}</td>
                          <td className="erp-muted" style={{ fontSize: 12 }}>{d.accountName || '—'}</td>
                          <td style={overdue(d) ? { color: '#dc2626', fontWeight: 600 } : undefined}>{dmy(d.dueDate)}</td>
                          <td><Badge tone={d.status === 'closed' ? 'ok' : d.status === 'partial' ? 'warn' : 'info'}>{d.status === 'closed' ? '✅ Закрыт' : d.status === 'partial' ? '◐ Частично' : '● Открыт'}</Badge></td>
                          <td className="erp-muted" style={{ fontSize: 12 }}>{d.createdByName || '—'}</td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                            {d.status !== 'closed' && <Button variant="outline" onClick={() => openPay(d)} style={{ fontSize: 12, padding: '4px 8px' }}>Погасить</Button>}
                            <button className="erp-icon-btn" title="Удалить" style={{ color: '#dc2626' }} onClick={() => removeDebt(d)}>🗑️</button>
                          </td>
                        </tr>
                        {openId === d.id && (
                          <tr className="debt-card"><td colSpan={9}>
                            <div className="debt-nums">
                              <div><div className="debt-num-lbl">ВЗЯТО</div><div className="debt-num-val">{fmt(d.amount)}</div></div>
                              <div><div className="debt-num-lbl">ПОГАШЕНО</div><div className="debt-num-val" style={{ color: '#16a34a' }}>{fmt(d.paidAmount)}</div></div>
                              <div><div className="debt-num-lbl">ОСТАЛОСЬ</div><div className="debt-num-val" style={{ color: rem > 0 ? '#dc2626' : '#16a34a', fontWeight: 800 }}>{fmt(rem)}</div></div>
                              <div style={{ marginLeft: 'auto', alignSelf: 'center' }}>{dueBadge(d)}</div>
                            </div>
                            <div className="debt-prog"><div className="debt-prog-fill" style={{ width: pct + '%' }} /></div>
                            <div className="erp-muted" style={{ fontSize: 12, margin: '2px 0 8px' }}>Выплачено {pct}%{d.comment ? ` · ${d.comment}` : ''}</div>
                            <div style={{ fontWeight: 700, fontSize: 13, margin: '4px 0 6px' }}>Платежи</div>
                            {!payments ? <div className="erp-muted">Загрузка…</div> : payments.length === 0 ? <div className="erp-muted" style={{ fontSize: 12 }}>Платежей нет.</div> : (
                              <table className="erp-table" style={{ fontSize: 12 }}>
                                <thead><tr><th>Дата</th><th style={{ textAlign: 'right' }}>Сумма</th><th>Счёт</th><th>Комментарий</th><th></th></tr></thead>
                                <tbody>{payments.map(p => (
                                  <tr key={p.id}>
                                    <td className="erp-muted">{dmy(p.payDate)}</td>
                                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(p.amount)}</td>
                                    <td className="erp-muted">{p.financeOpId ? accName(p.accountId) : <span title="Оплата до внесения в систему">— начальное сальдо</span>}</td>
                                    <td className="erp-muted">{p.comment || '—'}</td>
                                    <td style={{ textAlign: 'right' }}>{p.financeOpId && <button className="erp-icon-btn" title="Отменить платёж" style={{ color: '#dc2626' }} onClick={() => removePayment(p.id)}>↩</button>}</td>
                                  </tr>
                                ))}</tbody>
                              </table>
                            )}
                          </td></tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
        </Card>
      )}

      {/* Новый долг — «Мы должны» первым и по умолчанию + «Уже погашено» */}
      <Modal open={modal} onClose={() => setModal(false)} title="💳 Новый долг"
        footer={<><Button onClick={saveDebt} disabled={form.saving}>{form.saving ? 'Сохранение…' : 'Сохранить'}</Button><Button variant="outline" onClick={() => setModal(false)}>Отмена</Button></>}>
        {form.err && <div className="erp-form-err">{form.err}</div>}
        <div className="erp-chips" style={{ marginBottom: 12 }}>
          {[['credit', '📤 Мы должны'], ['debit', '📥 Нам должны']].map(([k, l]) => <button key={k} className={`erp-chip${form.type === k ? ' on' : ''}`} onClick={() => setForm(f => ({ ...f, type: k }))}>{l}</button>)}
        </div>
        <Field label="Контрагент" required>
          <Select value="" onChange={e => { const c = (clients || []).find(x => x.id === e.target.value); if (c) setForm(f => ({ ...f, name: c.name })); }}><option value="">— из клиентов или впишите —</option>{(clients || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
          <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="название / ФИО" style={{ marginTop: 6 }} />
        </Field>
        <div className="erp-form-row">
          <Field label="Сумма долга (₸)" required><Input type="number" min={0} value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} /></Field>
          <Field label="Уже погашено на момент внесения"><Input type="number" min={0} value={form.paidNow} onChange={e => setForm(f => ({ ...f, paidNow: e.target.value }))} /></Field>
        </div>
        <div className="erp-muted" style={{ fontSize: 11, marginTop: -4, marginBottom: 6 }}>Стартовое «погашено» — исторический факт (деньги уходили до системы): в Финансах операция НЕ создаётся, в истории долга — «начальное сальдо».{num(form.amount) > 0 && ` Остаток: ${fmt(Math.max(0, num(form.amount) - num(form.paidNow)))}.`}</div>
        <div className="erp-form-row">
          <Field label="Срок"><Input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} /></Field>
          <Field label="Счёт (для будущих погашений)"><Select value={form.accountId} onChange={e => setForm(f => ({ ...f, accountId: e.target.value }))}><option value="">— без счёта —</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}</Select></Field>
        </div>
        <Field label="Комментарий"><Input value={form.comment} onChange={e => setForm(f => ({ ...f, comment: e.target.value }))} /></Field>
      </Modal>

      <Modal open={pay.open} onClose={() => setPay(p => ({ ...p, open: false }))} title={`💵 Погашение — ${pay.debt ? counterparty(pay.debt) : ''}`}
        footer={<><Button onClick={savePay} disabled={pay.saving}>{pay.saving ? 'Проведение…' : 'Провести'}</Button><Button variant="outline" onClick={() => setPay(p => ({ ...p, open: false }))}>Отмена</Button></>}>
        {pay.err && <div className="erp-form-err">{pay.err}</div>}
        {pay.debt && <div className="erp-muted" style={{ fontSize: 12, marginBottom: 10 }}>Остаток: <b>{fmt(remaining(pay.debt))}</b> · {pay.debt.type === 'credit' ? 'спишется со счёта (Расход)' : 'поступит на счёт (Приход)'}</div>}
        <div className="erp-form-row">
          <Field label="Сумма (₸)" required><Input type="number" min={0} value={pay.amount} onChange={e => setPay(p => ({ ...p, amount: e.target.value }))} /></Field>
          <Field label="Дата"><Input type="date" value={pay.date} onChange={e => setPay(p => ({ ...p, date: e.target.value }))} /></Field>
        </div>
        <Field label="Счёт (списания/зачисления)"><Select value={pay.accountId} onChange={e => setPay(p => ({ ...p, accountId: e.target.value }))}><option value="">— без счёта —</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}</Select></Field>
        <Field label="Комментарий"><Input value={pay.comment} onChange={e => setPay(p => ({ ...p, comment: e.target.value }))} /></Field>
      </Modal>
    </div>
  );
}
