'use client';
import * as React from 'react';
import Link from 'next/link';
import { formatDate } from '@/lib/format';
import { useApi, apiSend } from '@/lib/api';
import { toast } from '@/lib/toast';
import { Card, Button, PageTitle, Modal, Field, Input, MoneyInput, Select, EmptyRow, DateRange } from '@/components/ui';
import { isRealIncome, isRealExpense } from '@/server/dto/finance.dto';
import { opIcon, opName, opSign, opAmountColor, isReversed, isReversal } from '@/lib/opDisplay';
import { purchaseDebts, pendingReceivables, type MoveLite, type SaleLite, type CertLite } from '@/lib/pending';

type Acct = { id: string; name: string; category?: string | null; section?: string | null; icon?: string | null; balance?: string | number | null; sortOrder?: number | null };
type Op = { id: string; opType: string; accountId: string; accountName?: string | null; amount: string | number; opDate?: string | null; name?: string | null; source?: string | null; reverses?: string | null; reversedAt?: string | null; createdByName?: string | null; saleId?: string | null; certId?: string | null };
// Можно ли отменить (сторно) операцию прямо в Финансах: не отменённая, не сторно,
// не перевод (нет 2-го счёта для отката), не начальный остаток, и не связана с
// продажей/сертификатом (у тех своя отмена: отмена продажи / снятие «Оплачено»).
const canReverseOp = (o: Op) => !isReversed(o) && !isReversal(o) && o.opType !== 'Перевод' && o.source !== 'Старт' && !o.saleId && !o.certId;
// Ссылка на исходный документ операции (чтобы не искать вручную).
const sourceLink = (o: Op): string | null =>
  o.saleId ? '/erp/sales' : o.certId ? '/erp/certs'
  : o.source === 'Закуп' ? '/erp/purchases'
  : o.source === 'Зарплата' ? '/erp/staff'
  : (o.source === 'Расходы' || (o.opType === 'Расход' && o.source !== 'Старт')) ? '/erp/expenses'
  : null;

const SECTIONS = [
  { key: 'poverka', no: 1, label: 'Поверка', icon: '📋', color: '#2563eb' },
  { key: 'sale', no: 2, label: 'Продажа', icon: '💰', color: '#d97706' },
  { key: 'other', no: 3, label: 'Прочие операции', icon: '📄', color: '#6f42c1' },
  { key: 'branch', no: 4, label: 'Филиал Астана', icon: '🏢', color: '#0d9488' },
  { key: 'branch_almaty', no: 5, label: 'Филиал Алматы', icon: '🏢', color: '#0891b2' },
];
const fmt = (n: number | string) => Math.round(Number(n) || 0).toLocaleString('ru-RU') + ' ₸';
const dmy = (d?: string | null) => formatDate(d);
const today = () => new Date().toISOString().slice(0, 10);

// Выбор счёта блоками: раздел (Поверка/Продажа/…) → его счета (Каспи/БЦК/Наличка)
// с балансом — как колонки на странице, а не плоский список.
// Выбор счёта: нативный сгруппированный select (разделы = optgroup, счета внутри
// с балансом). Нативный — всегда закрывается сам при выборе, без перекрытий/зависаний.
function AccountPicker({ accounts, value, onChange, placeholder }: { accounts: Acct[]; value: string; onChange: (id: string) => void; placeholder?: string }) {
  return (
    <Select value={value} onChange={e => onChange(e.target.value)}>
      <option value="">{placeholder || '— раздел и счёт —'}</option>
      {SECTIONS.map(s => {
        const accs = accounts.filter(a => (a.section || 'other') === s.key).sort((x, y) => Number(x.sortOrder ?? 0) - Number(y.sortOrder ?? 0));
        if (!accs.length) return null;
        return (
          <optgroup key={s.key} label={`№${s.no} ${s.label}`}>
            {accs.map(a => <option key={a.id} value={a.id}>{a.icon || '💳'} {a.name} · {fmt(a.balance ?? 0)}</option>)}
          </optgroup>
        );
      })}
    </Select>
  );
}

export default function FinancePage() {
  const [cat, setCat] = React.useState('all');
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const [fAcc, setFAcc] = React.useState('');   // фильтр по конкретному счёту
  const qs = new URLSearchParams(); if (from) qs.set('from', from); if (to) qs.set('to', to);
  const { data, error, isLoading, mutate } = useApi<{ accounts: Acct[]; operations: Op[] }>('/api/v2/finance' + (qs.toString() ? '?' + qs : ''));
  // Вычисляемые долги (ожидаемые поступления + долг поставщикам) — сводкой, без реестра.
  const movements = useApi<MoveLite[]>('/api/v2/products/movements?type=IN&limit=500');
  const salesData = useApi<SaleLite[]>('/api/v2/sales');
  const certsData = useApi<CertLite[]>('/api/v2/certs');
  const supDebt = purchaseDebts(movements.data || []);
  const pend = pendingReceivables(salesData.data || [], certsData.data || []);
  const accounts = data?.accounts || [];
  const ops = data?.operations || [];
  const secOf = (id: string) => accounts.find(a => a.id === id)?.section || 'other';
  const cats = cat === 'all' ? SECTIONS.map(s => s.key) : [cat];

  const [opModal, setOpModal] = React.useState(false);
  const [op, setOp] = React.useState({ type: 'Приход', accountId: '', toAccountId: '', amount: '', name: '', date: today(), err: '', saving: false });
  const [acctModal, setAcctModal] = React.useState(false);
  const [acc, setAcc] = React.useState({ id: '', name: '', category: 'kaspi', section: 'poverka', icon: '💳', balance: '', err: '', saving: false });

  const sortAccs = (list: Acct[]) => [...list].sort((a, b) => (Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0)) || String(a.name).localeCompare(String(b.name)));

  // Сброс выбранного счёта, если он не входит в текущий раздел (сменили чип).
  React.useEffect(() => { if (fAcc && !accounts.some(a => a.id === fAcc && cats.includes(a.section || 'other'))) setFAcc(''); }, [cat, accounts]);   // eslint-disable-line react-hooks/exhaustive-deps
  const matchAcc = (accountId: string) => !fAcc || accountId === fAcc;
  const visAccs = accounts.filter(a => cats.includes(a.section || 'other') && matchAcc(a.id));
  const visOps = ops.filter(o => cats.includes(secOf(o.accountId)) && matchAcc(o.accountId));
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
  async function reverseOp(o: Op) {
    if (!confirm(`Отменить операцию «${opName(o)}» на ${fmt(o.amount)}?\nБудет сторно — обратная операция вернёт баланс. Ошибку так исправляют.`)) return;
    try { await apiSend(`/api/v2/finance/${o.id}/reverse`, 'POST'); await mutate(); toast('↩️ Операция отменена (сторно)'); }
    catch (e) { toast('⚠️ ' + (e as Error).message); }
  }
  function editAcct(a: Acct) {
    const startOp = ops.find(o => o.accountId === a.id && o.source === 'Старт');
    setAcc({ id: a.id, name: a.name, category: a.category || 'other', section: a.section || 'poverka', icon: a.icon || '💳', balance: startOp ? String(Number(startOp.amount)) : '', err: '', saving: false });
    setAcctModal(true);
  }
  async function saveAcct() {
    if (!acc.name.trim()) { setAcc(a => ({ ...a, err: 'Введите название' })); return; }
    setAcc(a => ({ ...a, saving: true, err: '' }));
    try {
      if (acc.id) {
        await apiSend(`/api/v2/finance/accounts/${acc.id}`, 'PATCH', { name: acc.name.trim(), category: acc.category, section: acc.section, icon: acc.icon || null, startBalance: Number(acc.balance) || 0 });
        toast('✅ Счёт обновлён');
      } else {
        await apiSend('/api/v2/finance/accounts', 'POST', { name: acc.name.trim(), category: acc.category, section: acc.section, icon: acc.icon || null, balance: Number(acc.balance) || 0 });
        toast('✅ Счёт создан');
      }
      setAcctModal(false); await mutate();
    } catch (e) { setAcc(a => ({ ...a, err: (e as Error).message, saving: false })); }
  }

  return (
    <div>
      <PageTitle title="Финансы" sub="Счета и операции по разделам" action={
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="outline" onClick={() => { setAcc({ id: '', name: '', category: 'kaspi', section: cat === 'all' ? 'poverka' : cat, icon: '💳', balance: '', err: '', saving: false }); setAcctModal(true); }}>+ Счёт</Button>
          <Button onClick={() => { setOp({ type: 'Приход', accountId: '', toAccountId: '', amount: '', name: '', date: today(), err: '', saving: false }); setOpModal(true); }}>+ Операция</Button>
        </div>} />

      <Card className="erp-filters">
        <div className="erp-chips">
          <button className={`erp-chip${cat === 'all' ? ' on' : ''}`} onClick={() => setCat('all')}>Все</button>
          {SECTIONS.map(s => <button key={s.key} className={`erp-chip${cat === s.key ? ' on' : ''}`} style={cat === s.key ? { background: s.color, borderColor: s.color, color: '#fff' } : undefined} onClick={() => setCat(s.key)}>№{s.no} {s.icon} {s.label}</button>)}
        </div>
        <DateRange from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
        <Select value={fAcc} onChange={e => setFAcc(e.target.value)} title="Фильтр по счёту" style={{ width: 190 }}>
          <option value="">Счёт: все</option>
          {SECTIONS.filter(s => cats.includes(s.key)).map(s => {
            const accs = sortAccs(accounts.filter(a => (a.section || 'other') === s.key));
            return accs.length ? <optgroup key={s.key} label={`№${s.no} ${s.label}`}>{accs.map(a => <option key={a.id} value={a.id}>{a.icon || '💳'} {a.name}</option>)}</optgroup> : null;
          })}
        </Select>
      </Card>

      <div className="erp-kpi-grid" style={{ marginTop: 12 }}>
        <div className="erp-kpi"><div className="erp-kpi-top"><span className="erp-kpi-ico">💳</span><span className="erp-kpi-label">Касса</span></div><div className="erp-kpi-val">{fmt(cash)}</div></div>
        <div className="erp-kpi"><div className="erp-kpi-top"><span className="erp-kpi-ico">📥</span><span className="erp-kpi-label">Приход за период</span></div><div className="erp-kpi-val" style={{ color: '#16a34a' }}>{fmt(income)}</div></div>
        <div className="erp-kpi"><div className="erp-kpi-top"><span className="erp-kpi-ico">📤</span><span className="erp-kpi-label">Расход за период</span></div><div className="erp-kpi-val" style={{ color: '#dc2626' }}>{fmt(expense)}</div></div>
      </div>

      {/* Ожидаемые поступления (нам должны) + долг поставщикам (мы должны) — сводкой */}
      <div className="erp-panels" style={{ marginTop: 12 }}>
        <Card>
          <h3>⏳ Ждём оплаты — нам должны <Link href="/erp/sales" style={{ float: 'right', fontSize: 12, fontWeight: 400 }}>Продажи →</Link></h3>
          <div className="erp-kpi-val" style={{ color: '#b45309', fontSize: 24 }}>{fmt(pend.total)}</div>
          <div className="erp-sections" style={{ marginTop: 8 }}>
            <div className="erp-sec-row"><span className="erp-sec-dot" style={{ background: '#d97706' }} /><span className="erp-sec-label">Продажи в ожидании{pend.salesCount ? ` · ${pend.salesCount}` : ''}</span><span className="erp-sec-val">{fmt(pend.salesTotal)}</span></div>
            <div className="erp-sec-row"><span className="erp-sec-dot" style={{ background: '#2563eb' }} /><span className="erp-sec-label">Поверки в ожидании{pend.certsCount ? ` · ${pend.certsCount}` : ''}</span><span className="erp-sec-val">{fmt(pend.certsTotal)}</span></div>
          </div>
          <div className="erp-muted" style={{ fontSize: 11, marginTop: 6 }}>Оплата ещё не проведена. При оплате продажи/поверки сумма уйдёт из ожидания и станет приходом на счёт.</div>
        </Card>

        <Card>
          <h3>🏭 Долг поставщикам — мы должны <Link href="/erp/purchases" style={{ float: 'right', fontSize: 12, fontWeight: 400 }}>Закупки →</Link></h3>
          <div className="erp-kpi-val" style={{ color: '#dc2626', fontSize: 24 }}>{fmt(supDebt.total)}</div>
          {supDebt.bySupplier.length === 0 ? <p className="erp-muted" style={{ fontSize: 13, marginTop: 8 }}>Долгов по закупам нет ✓</p> : (
            <div className="erp-sections" style={{ marginTop: 8 }}>
              {supDebt.bySupplier.slice(0, 6).map(s => (
                <div className="erp-sec-row" key={s.supplier}><span className="erp-sec-dot" style={{ background: '#dc2626' }} /><span className="erp-sec-label">{s.supplier}</span><span className="erp-sec-val">{fmt(s.amount)}</span></div>
              ))}
            </div>
          )}
          <div className="erp-muted" style={{ fontSize: 11, marginTop: 6 }}>Закупы «В долг» (не оплачены). Погасить — в Закупках, кнопкой 💵.</div>
        </Card>
      </div>

      {error ? <Card><EmptyRow>Нет доступа к финансам.</EmptyRow></Card> : isLoading ? <Card><EmptyRow>Загрузка…</EmptyRow></Card> : (
        <div className="erp-fin-cols">
          {cats.map(c => {
            const sec = SECTIONS.find(s => s.key === c)!;
            const accs = sortAccs(accounts.filter(a => (a.section || 'other') === c));
            const accNoById = new Map(accs.map((a, i) => [a.id, i + 1]));   // № счёта внутри раздела (по всем счетам раздела)
            if (fAcc && !accs.some(a => a.id === fAcc)) return null;        // выбран счёт другого раздела — колонку скрываем
            const accsShown = fAcc ? accs.filter(a => a.id === fAcc) : accs;
            const total = accsShown.reduce((s, a) => s + (Number(a.balance) || 0), 0);
            const movs = ops.filter(o => secOf(o.accountId) === c && (!fAcc || o.accountId === fAcc)).sort((a, b) => String(b.opDate).localeCompare(String(a.opDate)));
            // связь отменённой пары: исходная ↔ её сторно (для подсказки «связана с …»)
            const revByOrig = new Map(ops.filter(o => o.reverses).map(o => [o.reverses as string, o]));
            const opById = new Map(ops.map(o => [o.id, o]));
            const pairTitle = (o: Op) => { const c2 = isReversal(o) ? opById.get(o.reverses as string) : isReversed(o) ? revByOrig.get(o.id) : null; return c2 ? `связана с: ${opName(c2)} (${dmy(c2.opDate)})` : undefined; };
            return (
              <div className="erp-fin-col" key={c}>
                <div className="erp-fin-head" style={{ background: sec.color }}><span>№{sec.no} {sec.icon} {sec.label}</span><span>{fmt(total)}</span></div>
                <div className="erp-fin-accs">
                  {accsShown.length === 0 ? <div className="erp-muted" style={{ fontSize: 12, padding: 6 }}>Нет счетов</div> : accsShown.map((a) => (
                    <div className="erp-fin-acc" key={a.id}><span><b>№{accNoById.get(a.id)}</b> {a.icon} {a.name}</span><span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{fmt(a.balance || 0)}<button className="erp-icon-btn" title="Изменить счёт / начальный остаток" style={{ fontSize: 13 }} onClick={() => editAcct(a)}>✏️</button></span></div>
                  ))}
                </div>
                <div className="erp-fin-movs">
                  <div className="erp-fin-movh">Движения · {movs.length}</div>
                  {movs.length === 0 ? <div className="erp-muted" style={{ fontSize: 12 }}>Нет движений</div> : movs.slice(0, 30).map(o => (
                    <div className="erp-fin-mov" key={o.id} title={pairTitle(o)}>
                      <span style={{ flexShrink: 0 }}>{opIcon(o)}</span>
                      <span className="erp-fin-movd">{dmy(o.opDate)}</span>
                      <span title={o.accountName || ''} style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, color: '#475569', background: '#eef2f7', borderRadius: 5, padding: '0 5px' }}>№{accNoById.get(o.accountId) ?? '?'}</span>
                      <span className="erp-fin-movt" style={isReversed(o) ? { textDecoration: 'line-through', opacity: .55 } : undefined}>{opName(o)}{o.createdByName ? <span className="erp-muted" style={{ marginLeft: 6, fontSize: 10 }}>· {o.createdByName}</span> : null}</span>
                      <span style={{ color: opAmountColor(o), fontWeight: 700, whiteSpace: 'nowrap' }}>{opSign(o)}{fmt(o.amount)}</span>
                      {sourceLink(o) && <Link href={sourceLink(o)!} title="Открыть исходный документ" className="erp-icon-btn" style={{ flexShrink: 0, fontSize: 12, padding: '0 4px', lineHeight: 1, textDecoration: 'none' }}>🔗</Link>}
                      {canReverseOp(o) && <button className="erp-icon-btn" title="Отменить операцию (сторно)" style={{ color: '#dc2626', flexShrink: 0, fontSize: 12, padding: '0 4px', lineHeight: 1 }} onClick={() => reverseOp(o)}>↩️</button>}
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
          <AccountPicker accounts={accounts} value={op.accountId} onChange={id => setOp(o => ({ ...o, accountId: id }))} />
        </Field>
        {op.type === 'Перевод' && <Field label="На счёт" required><AccountPicker accounts={accounts} value={op.toAccountId} onChange={id => setOp(o => ({ ...o, toAccountId: id }))} /></Field>}
        <div className="erp-form-row">
          <Field label="Сумма (₸)" required><MoneyInput value={op.amount} onValue={v => setOp(o => ({ ...o, amount: v }))} placeholder="0" /></Field>
          <Field label="Дата"><Input type="date" value={op.date} onChange={e => setOp(o => ({ ...o, date: e.target.value }))} /></Field>
        </div>
        <Field label="Назначение"><Input value={op.name} onChange={e => setOp(o => ({ ...o, name: e.target.value }))} placeholder="комментарий" /></Field>
      </Modal>

      <Modal open={acctModal} onClose={() => setAcctModal(false)} title={acc.id ? '✏️ Счёт' : '➕ Новый счёт'}
        footer={<><Button onClick={saveAcct} disabled={acc.saving}>{acc.saving ? 'Сохранение…' : acc.id ? 'Сохранить' : 'Создать'}</Button><Button variant="outline" onClick={() => setAcctModal(false)}>Отмена</Button></>}>
        {acc.err && <div className="erp-form-err">{acc.err}</div>}
        <Field label="Название" required><Input value={acc.name} onChange={e => setAcc(a => ({ ...a, name: e.target.value }))} placeholder="напр. Каспи" /></Field>
        <div className="erp-form-row">
          <Field label="Раздел"><Select value={acc.section} onChange={e => setAcc(a => ({ ...a, section: e.target.value }))}>{SECTIONS.map(s => <option key={s.key} value={s.key}>№{s.no} {s.label}</option>)}</Select></Field>
          <Field label="Банк"><Select value={acc.category} onChange={e => setAcc(a => ({ ...a, category: e.target.value }))}><option value="kaspi">Kaspi</option><option value="bck">БЦК</option><option value="nalichka">Наличка</option><option value="other">Другое</option></Select></Field>
        </div>
        <div className="erp-form-row">
          <Field label="Иконка"><Input value={acc.icon} onChange={e => setAcc(a => ({ ...a, icon: e.target.value }))} /></Field>
          <Field label="Начальный остаток (₸)"><MoneyInput value={acc.balance} onValue={v => setAcc(a => ({ ...a, balance: v }))} placeholder="0" /></Field>
        </div>
      </Modal>
    </div>
  );
}
