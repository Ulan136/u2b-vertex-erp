'use client';
import * as React from 'react';
import { formatDate } from '@/lib/format';
import { useApi, apiSend } from '@/lib/api';
import { toast } from '@/lib/toast';
import { Card, Badge, Button, PageTitle, Modal, Field, Input, Select, EmptyRow, DateRange } from '@/components/ui';

type Debt = { id: string; type: string; amount: string | number; paidAmount: string | number; status: string; clientName?: string | null; counterpartyName?: string | null; accountId?: string | null; accountName?: string | null; dueDate?: string | null; comment?: string | null; createdByName?: string | null; categoryId?: string | null; categoryName?: string | null; categoryIcon?: string | null };
type Payment = { id: string; amount: string | number; payDate?: string | null; accountId?: string | null; comment?: string | null; financeOpId?: string | null };
type Journal = { id: string; payDate?: string | null; amount: number; accountName?: string | null; author?: string | null; comment?: string | null; counterparty: string; debtType: string; debtAmount: number; remainingAfter: number };
type Acct = { id: string; name: string; icon?: string | null; section?: string | null; sortOrder?: number | null; balance?: string | number | null };
type Cat = { id: string; name: string; icon?: string | null };
type PayRow = { accountId: string; amount: string };

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
const SECTIONS: Array<[string, string]> = [['poverka', '№1 Поверка'], ['sale', '№2 Продажа'], ['other', '№3 Прочие'], ['branch', '№4 Филиал Астана'], ['branch_almaty', '№5 Филиал Алматы']];

export default function DebtsPage() {
  const [tab, setTab] = React.useState('credit');
  const [q, setQ] = React.useState('');
  const [catFilter, setCatFilter] = React.useState('');   // фильтр по категории (кредиторка)
  const [dFrom, setDFrom] = React.useState('');           // фильтр по сроку (dueDate)
  const [dTo, setDTo] = React.useState('');
  const isJournal = tab === 'journal';
  const qs = new URLSearchParams(); if (tab === 'debit' || tab === 'credit') qs.set('type', tab); if (q.trim()) qs.set('q', q.trim());
  const { data: debts, error, isLoading, mutate } = useApi<Debt[]>(!isJournal ? '/api/v2/debts' + (qs.toString() ? '?' + qs : '') : null);
  const { data: all } = useApi<Debt[]>('/api/v2/debts');
  const { data: fin } = useApi<{ accounts: Acct[] }>('/api/v2/finance');
  const { data: cats, mutate: mutateCats } = useApi<Cat[]>('/api/v2/debt-categories');
  const accounts = React.useMemo(() => (fin?.accounts || []).slice().sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0)), [fin]);
  const catList = cats || [];

  // Список с учётом фильтра по категории (для кредиторки/всех).
  const list = React.useMemo(() => {
    let base = debts || [];
    if (catFilter) base = base.filter(d => (d.categoryId || '') === catFilter);
    if (dFrom || dTo) base = base.filter(d => { const x = iso(d.dueDate); if (!x) return false; if (dFrom && x < dFrom) return false; if (dTo && x > dTo) return false; return true; });
    return base;
  }, [debts, catFilter, dFrom, dTo]);

  const sumRem = (type: string) => (all || []).filter(d => d.type === type && d.status !== 'closed').reduce((s, d) => s + remaining(d), 0);
  const overdueSum = (all || []).filter(d => overdue(d)).reduce((s, d) => s + remaining(d), 0);
  // Остаток «мы должны» по категориям (для чипов-фильтра).
  const remByCat = React.useMemo(() => {
    const m: Record<string, number> = {};
    (all || []).filter(d => d.type === 'credit' && d.status !== 'closed').forEach(d => { const k = d.categoryId || ''; m[k] = (m[k] || 0) + remaining(d); });
    return m;
  }, [all]);

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
  const accLabel = (a: Acct) => `${a.icon ? a.icon + ' ' : ''}${a.name} · ${fmt(a.balance || 0)}`;

  // ── модалка нового долга ──
  const [modal, setModal] = React.useState(false);
  const [form, setForm] = React.useState({ type: 'credit', name: '', amount: '', paidNow: '0', accountId: '', categoryId: '', dueDate: '', comment: '', err: '', saving: false });
  function openNew() { setForm({ type: tab === 'debit' ? 'debit' : 'credit', name: '', amount: '', paidNow: '0', accountId: '', categoryId: catFilter || '', dueDate: '', comment: '', err: '', saving: false }); setModal(true); }
  async function saveDebt() {
    if (!form.name.trim()) { setForm(f => ({ ...f, err: 'Укажите контрагента' })); return; }
    const amt = num(form.amount); if (amt <= 0) { setForm(f => ({ ...f, err: 'Сумма больше 0' })); return; }
    const paid = num(form.paidNow); if (paid > amt) { setForm(f => ({ ...f, err: 'Погашено не может быть больше суммы' })); return; }
    setForm(f => ({ ...f, saving: true, err: '' }));
    try {
      await apiSend('/api/v2/debts', 'POST', { type: form.type, counterpartyName: form.name.trim(), amount: amt, paidAmount: paid, accountId: form.accountId || null, categoryId: form.categoryId || null, dueDate: form.dueDate || null, comment: form.comment || null });
      setModal(false); await mutate(); toast('✅ Долг добавлен');
    } catch (e) { setForm(f => ({ ...f, err: (e as Error).message, saving: false })); }
  }

  // ── модалка погашения (с нескольких счетов) ──
  const [pay, setPay] = React.useState({ open: false, debt: null as Debt | null, rows: [{ accountId: '', amount: '' }] as PayRow[], date: today(), comment: '', err: '', saving: false });
  const payTotal = pay.rows.reduce((s, r) => s + num(r.amount), 0);
  function openPay(d: Debt) { setPay({ open: true, debt: d, rows: [{ accountId: d.accountId || '', amount: String(remaining(d)) }], date: today(), comment: '', err: '', saving: false }); }
  function setRowAcc(i: number, accountId: string) {
    setPay(p => { const rem = p.debt ? remaining(p.debt) : 0; const others = p.rows.reduce((a, r, j) => a + (j === i ? 0 : num(r.amount)), 0); const left = Math.max(0, Math.round((rem - others) * 100) / 100); return { ...p, rows: p.rows.map((r, j) => j === i ? { ...r, accountId, amount: r.amount || (left ? String(left) : '') } : r) }; });
  }
  const setRowAmt = (i: number, amount: string) => setPay(p => ({ ...p, rows: p.rows.map((r, j) => j === i ? { ...r, amount } : r) }));
  const addRow = () => setPay(p => ({ ...p, rows: [...p.rows, { accountId: '', amount: '' }] }));
  const removeRow = (i: number) => setPay(p => ({ ...p, rows: p.rows.length > 1 ? p.rows.filter((_, j) => j !== i) : p.rows }));
  async function savePay() {
    const d = pay.debt; if (!d) return;
    const rows = pay.rows.filter(r => r.accountId && num(r.amount) > 0).map(r => ({ accountId: r.accountId, amount: num(r.amount) }));
    const total = rows.reduce((s, r) => s + r.amount, 0);
    if (total <= 0) { setPay(p => ({ ...p, err: 'Укажите счёт и сумму' })); return; }
    if (total > remaining(d) + 0.005) { setPay(p => ({ ...p, err: `Всего больше остатка: ${fmt(remaining(d))}` })); return; }
    setPay(p => ({ ...p, saving: true, err: '' }));
    try {
      await apiSend(`/api/v2/debts/${d.id}/payments`, 'POST', { payments: rows, payDate: pay.date || null, comment: pay.comment || null });
      setPay(p => ({ ...p, open: false })); await mutate(); toast(rows.length > 1 ? '✅ Погашение с нескольких счетов проведено' : '✅ Погашение проведено (операция в финансах)');
    } catch (e) { setPay(p => ({ ...p, err: (e as Error).message, saving: false })); }
  }
  async function removePayment(pid: string) {
    if (!confirm('Отменить платёж? Операция будет отменена, остаток вернётся.')) return;
    try { await apiSend(`/api/v2/debt-payments/${pid}`, 'DELETE'); await mutate(); toast('↩️ Платёж отменён'); }
    catch (e) { toast('⚠️ ' + (e as Error).message); }
  }
  async function removeDebt(d: Debt) {
    if (!confirm('Удалить долг? Связанные погашения/операции будут откачены.')) return;
    try { await apiSend(`/api/v2/debts/${d.id}`, 'DELETE'); await mutate(); toast('🗑️ Удалено'); }
    catch (e) { toast('⚠️ ' + (e as Error).message); }
  }

  // ── управление категориями ──
  const [catModal, setCatModal] = React.useState(false);
  const [newCat, setNewCat] = React.useState('');
  const [newCatIcon, setNewCatIcon] = React.useState('📁');
  async function addCat() { if (!newCat.trim()) return; try { await apiSend('/api/v2/debt-categories', 'POST', { name: newCat.trim(), icon: newCatIcon || '📁' }); setNewCat(''); setNewCatIcon('📁'); await mutateCats(); toast('✅ Категория добавлена'); } catch (e) { toast('⚠️ ' + (e as Error).message); } }
  async function delCat(c: Cat) { if (!confirm(`Удалить категорию «${c.name}»? Долги останутся, но без категории.`)) return; try { await apiSend(`/api/v2/debt-categories/${c.id}`, 'DELETE'); await mutateCats(); await mutate(); } catch (e) { toast('⚠️ ' + (e as Error).message); } }

  const dueBadge = (d: Debt) => {
    const n = daysLeft(d); if (n === null) return null;
    if (n < 0) return <Badge tone="err">просрочен на {Math.abs(n)} дн</Badge>;
    if (n === 0) return <Badge tone="warn">срок сегодня</Badge>;
    return <Badge tone="neutral">осталось {n} дн</Badge>;
  };
  const catChip = (d: Debt) => d.categoryId ? `${d.categoryIcon || '📁'} ${d.categoryName || ''}` : '—';
  const showCats = tab === 'credit' || tab === 'all';

  return (
    <div>
      <PageTitle title="Долги" sub="Кредиторка и дебиторка — по остаткам" action={<Button onClick={openNew}>+ Долг</Button>} />

      <div className="erp-kpi-grid">
        <div className="erp-kpi"><div className="erp-kpi-top"><span className="erp-kpi-ico">📤</span><span className="erp-kpi-label">Мы должны (остаток)</span></div><div className="erp-kpi-val" style={{ color: '#dc2626' }}>{fmt(sumRem('credit'))}</div></div>
        <div className="erp-kpi"><div className="erp-kpi-top"><span className="erp-kpi-ico">📥</span><span className="erp-kpi-label">Нам должны (остаток)</span></div><div className="erp-kpi-val" style={{ color: '#16a34a' }}>{fmt(sumRem('debit'))}</div></div>
        <div className="erp-kpi"><div className="erp-kpi-top"><span className="erp-kpi-ico">⏰</span><span className="erp-kpi-label">Просрочено</span></div><div className="erp-kpi-val" style={{ color: '#b45309' }}>{fmt(overdueSum)}</div></div>
      </div>

      <Card className="erp-filters" style={{ marginTop: 12, flexWrap: 'wrap', gap: 8 }}>
        <div className="erp-chips">
          {TABS.map(([k, l]) => <button key={k} className={`erp-chip${tab === k ? ' on' : ''}`} onClick={() => { setTab(k); setOpenId(null); setCatFilter(''); }}>{l}</button>)}
        </div>
        <Input placeholder="🔍 Контрагент" value={q} onChange={e => setQ(e.target.value)} />
        {isJournal && <>
          <DateRange from={jFrom} to={jTo} onChange={(f, t) => { setJFrom(f); setJTo(t); }} />
          <Button variant="outline" onClick={exportJournal}>⬇ Excel</Button>
        </>}
        {!isJournal && <><span className="erp-muted" style={{ fontSize: 12 }}>Срок:</span><DateRange from={dFrom} to={dTo} onChange={(f, t) => { setDFrom(f); setDTo(t); }} /></>}
      </Card>

      {/* Категории (фильтр по кредиторке): чипы с остатком + управление */}
      {showCats && (
        <Card style={{ marginTop: 8, flexWrap: 'wrap', gap: 6, display: 'flex', alignItems: 'center', padding: 10 }}>
          <span className="erp-muted" style={{ fontSize: 12, fontWeight: 700 }}>Категории:</span>
          <button className={`erp-chip${catFilter === '' ? ' on' : ''}`} onClick={() => setCatFilter('')}>Все</button>
          {catList.map(c => <button key={c.id} className={`erp-chip${catFilter === c.id ? ' on' : ''}`} onClick={() => setCatFilter(catFilter === c.id ? '' : c.id)}>{c.icon || '📁'} {c.name}{remByCat[c.id] ? <span className="erp-muted" style={{ marginLeft: 4 }}>{fmt(remByCat[c.id])}</span> : null}</button>)}
          {remByCat[''] ? <button className={`erp-chip${catFilter === '__none__' ? ' on' : ''}`} onClick={() => setCatFilter('')} style={{ opacity: .7 }} title="Без категории">без категории · {fmt(remByCat[''])}</button> : null}
          <button className="erp-icon-btn" title="Категории (добавить/удалить)" onClick={() => setCatModal(true)} style={{ marginLeft: 'auto' }}>⚙️ категории</button>
        </Card>
      )}

      {isJournal ? (
        <Card className="erp-journal" style={{ marginTop: 12, padding: 0 }}>
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
        <Card className="erp-journal" style={{ marginTop: 12, padding: 0 }}>
          {error ? <EmptyRow>Нет доступа к долгам.</EmptyRow> : isLoading ? <EmptyRow>Загрузка…</EmptyRow>
            : list.length === 0 ? <EmptyRow>{catFilter ? 'В этой категории долгов нет.' : 'Долгов нет. Нажмите «+ Долг».'}</EmptyRow>
            : (
              <table className="erp-table">
                <thead><tr><th>Контрагент</th>{showCats && <th>Категория</th>}<th style={{ textAlign: 'right' }}>Взято</th><th style={{ textAlign: 'right' }}>Погашено</th><th style={{ textAlign: 'right' }}>Остаток</th><th>Счёт</th><th>Срок</th><th>Статус</th><th>Автор</th><th style={{ textAlign: 'right' }}>Действия</th></tr></thead>
                <tbody>
                  {list.map(d => {
                    const rem = remaining(d); const pct = num(d.amount) > 0 ? Math.min(100, Math.round(num(d.paidAmount) / num(d.amount) * 100)) : 0;
                    const cols = showCats ? 10 : 9;
                    return (
                      <React.Fragment key={d.id}>
                        <tr className="debt-row" onClick={() => setOpenId(openId === d.id ? null : d.id)}>
                          <td className="erp-td-main">{openId === d.id ? '▾ ' : '▸ '}{d.type === 'credit' ? '📤' : '📥'} {counterparty(d)}</td>
                          {showCats && <td className="erp-muted" style={{ fontSize: 12 }}>{catChip(d)}</td>}
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
                          <tr className="debt-card"><td colSpan={cols}>
                            <div className="debt-nums">
                              <div><div className="debt-num-lbl">ВЗЯТО</div><div className="debt-num-val">{fmt(d.amount)}</div></div>
                              <div><div className="debt-num-lbl">ПОГАШЕНО</div><div className="debt-num-val" style={{ color: '#16a34a' }}>{fmt(d.paidAmount)}</div></div>
                              <div><div className="debt-num-lbl">ОСТАЛОСЬ</div><div className="debt-num-val" style={{ color: rem > 0 ? '#dc2626' : '#16a34a', fontWeight: 800 }}>{fmt(rem)}</div></div>
                              <div style={{ marginLeft: 'auto', alignSelf: 'center' }}>{dueBadge(d)}</div>
                            </div>
                            <div className="debt-prog"><div className="debt-prog-fill" style={{ width: pct + '%' }} /></div>
                            <div className="erp-muted" style={{ fontSize: 12, margin: '2px 0 8px' }}>Выплачено {pct}%{d.categoryName ? ` · ${d.categoryIcon || '📁'} ${d.categoryName}` : ''}{d.comment ? ` · ${d.comment}` : ''}</div>
                            {d.status !== 'closed' && <Button onClick={() => openPay(d)} style={{ fontSize: 13, marginBottom: 8 }}>💵 Погасить</Button>}
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

      {/* Новый долг */}
      <Modal open={modal} onClose={() => setModal(false)} title="💳 Новый долг"
        footer={<><Button onClick={saveDebt} disabled={form.saving}>{form.saving ? 'Сохранение…' : 'Сохранить'}</Button><Button variant="outline" onClick={() => setModal(false)}>Отмена</Button></>}>
        {form.err && <div className="erp-form-err">{form.err}</div>}
        <div className="erp-chips" style={{ marginBottom: 12 }}>
          {[['credit', '📤 Мы должны'], ['debit', '📥 Нам должны']].map(([k, l]) => <button key={k} className={`erp-chip${form.type === k ? ' on' : ''}`} onClick={() => setForm(f => ({ ...f, type: k }))}>{l}</button>)}
        </div>
        <Field label="Название / ФИО" required>
          <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="название / ФИО" />
        </Field>
        <div className="erp-form-row">
          <Field label="Сумма долга (₸)" required><Input type="number" min={0} value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} /></Field>
          <Field label="Уже погашено на момент внесения"><Input type="number" min={0} value={form.paidNow} onChange={e => setForm(f => ({ ...f, paidNow: e.target.value }))} /></Field>
        </div>
        <div className="erp-muted" style={{ fontSize: 11, marginTop: -4 }}>Стартовое «погашено» — исторический факт (деньги уходили до системы): операция в Финансах НЕ создаётся.{num(form.amount) > 0 && ` Остаток: ${fmt(Math.max(0, num(form.amount) - num(form.paidNow)))}.`}{catFilter ? ' Категория подставится из выбранного фильтра.' : ''}</div>
      </Modal>

      {/* Погашение — с нескольких счетов, как в расходах */}
      <Modal open={pay.open} onClose={() => setPay(p => ({ ...p, open: false }))} title={`💵 Погашение — ${pay.debt ? counterparty(pay.debt) : ''}`}
        footer={<><Button onClick={savePay} disabled={pay.saving}>{pay.saving ? 'Проведение…' : `Провести ${payTotal > 0 ? fmt(payTotal) : ''}`}</Button><Button variant="outline" onClick={() => setPay(p => ({ ...p, open: false }))}>Отмена</Button></>}>
        {pay.err && <div className="erp-form-err">{pay.err}</div>}
        {pay.debt && <div className="erp-muted" style={{ fontSize: 12, marginBottom: 10 }}>Остаток: <b>{fmt(remaining(pay.debt))}</b> · {pay.debt.type === 'credit' ? 'спишется со счёта (Расход)' : 'поступит на счёт (Приход)'}</div>}
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>С каких счетов гасим</div>
        {pay.rows.map((r, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
            <Select value={r.accountId} onChange={e => setRowAcc(i, e.target.value)} style={{ flex: 3 }}>
              <option value="">— счёт —</option>
              {SECTIONS.map(([sk, sl]) => { const secAccs = accounts.filter(a => (a.section || 'other') === sk); return secAccs.length ? <optgroup key={sk} label={sl}>{secAccs.map(a => <option key={a.id} value={a.id}>{accLabel(a)}</option>)}</optgroup> : null; })}
            </Select>
            <Input type="number" min={0} value={r.amount} onChange={e => setRowAmt(i, e.target.value)} placeholder="сумма" style={{ flex: 1, minWidth: 90 }} />
            <button className="erp-icon-btn" title="Убрать счёт" style={{ color: '#dc2626', opacity: pay.rows.length > 1 ? 1 : .3 }} onClick={() => removeRow(i)} disabled={pay.rows.length <= 1}>✕</button>
          </div>
        ))}
        <button className="erp-chip" style={{ marginBottom: 10 }} onClick={addRow}>➕ ещё счёт</button>
        {pay.debt && <div className="erp-muted" style={{ fontSize: 12, marginBottom: 10 }}>Итого к погашению: <b>{fmt(payTotal)}</b> из остатка {fmt(remaining(pay.debt))}{payTotal > remaining(pay.debt) + 0.005 ? ' — больше остатка!' : ''}</div>}
        <div className="erp-form-row">
          <Field label="Дата"><Input type="date" value={pay.date} onChange={e => setPay(p => ({ ...p, date: e.target.value }))} /></Field>
          <Field label="Комментарий"><Input value={pay.comment} onChange={e => setPay(p => ({ ...p, comment: e.target.value }))} /></Field>
        </div>
      </Modal>

      {/* Управление категориями долгов */}
      <Modal open={catModal} onClose={() => setCatModal(false)} title="⚙️ Категории долгов"
        footer={<Button variant="outline" onClick={() => setCatModal(false)}>Закрыть</Button>}>
        <div className="erp-muted" style={{ fontSize: 12, marginBottom: 10 }}>Категории для кредиторки (Поставщики, Банковский кредит, Аренда…). Ведёте сами.</div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, alignItems: 'center' }}>
          <Input value={newCatIcon} onChange={e => setNewCatIcon(e.target.value)} placeholder="📁" style={{ width: 56, textAlign: 'center' }} maxLength={4} />
          <Input value={newCat} onChange={e => setNewCat(e.target.value)} placeholder="Название категории" onKeyDown={e => { if (e.key === 'Enter') addCat(); }} />
          <Button onClick={addCat}>Добавить</Button>
        </div>
        {catList.length === 0 ? <div className="erp-muted" style={{ fontSize: 12 }}>Категорий пока нет.</div> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {catList.map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ fontSize: 16 }}>{c.icon || '📁'}</span>
                <span style={{ flex: 1, fontSize: 14 }}>{c.name}</span>
                {remByCat[c.id] ? <span className="erp-muted" style={{ fontSize: 12 }}>{fmt(remByCat[c.id])}</span> : null}
                <button className="erp-icon-btn" title="Удалить" style={{ color: '#dc2626' }} onClick={() => delCat(c)}>🗑️</button>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
