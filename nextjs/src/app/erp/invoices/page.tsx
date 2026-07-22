'use client';
import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useApi, apiSend } from '@/lib/api';
import { toast } from '@/lib/toast';
import { Card, Badge, Button, PageTitle, Modal, Field, Input, Select, EmptyRow } from '@/components/ui';

type Acct = { id: string; name: string; icon?: string | null; section?: string | null; category?: string | null; sortOrder?: number | null };
type Op = { id: string; opType: string; amount: string | number; opDate?: string | null; name?: string | null; accountName?: string | null; accountId: string; comment?: string | null };
type Client = { id: string; name: string };

const SECTIONS = [{ key: 'poverka', no: 1, label: 'Поверка', color: '#2563eb' }, { key: 'sale', no: 2, label: 'Продажа', color: '#d97706' }, { key: 'branch', no: 3, label: 'Филиалы', color: '#0d9488' }, { key: 'other', no: 4, label: 'Прочие операции', color: '#6f42c1' }];
const SECTION_SOURCES: Record<string, string[]> = { poverka: ['📋 САМИ', '🏭 ВДК', '⚡ ТЭЦ', '🚗 Выездная'], sale: ['💰 Продажа', '🆕 Первичная'], branch: ['🏢 Филиалы'], other: ['📁 Проект', '📜 Тендер', '🛠 Услуга'] };
const BANKS = [{ key: 'all', label: 'Все', badge: '' }, { key: 'kaspi', label: '🍊 Каспи', badge: '🍊' }, { key: 'bck', label: '🏦 БЦК', badge: '🏦' }, { key: 'nalichka', label: '💵 Наличка', badge: '💵' }];
const BANK_LABEL: Record<string, string> = { kaspi: '🍊 Каспи', bck: '🏦 БЦК', nalichka: '💵 Наличка', other: '💳 Другое' };
const num = (v: unknown) => Number(v) || 0;
const fmt = (n: number | string) => (Number(n) || 0).toLocaleString('ru-RU') + ' ₸';
const dmy = (d?: string | null) => (d ? String(d).slice(0, 10).split('-').reverse().join('.') : '—');
const today = () => new Date().toISOString().slice(0, 10);

function InvoicesInner() {
  const sp = useSearchParams();
  const init = sp.get('section');
  const kind = sp.get('kind');
  const [section, setSection] = React.useState(SECTIONS.some(s => s.key === init) ? init! : 'poverka');
  const [bank, setBank] = React.useState('all');
  const [q, setQ] = React.useState('');
  React.useEffect(() => { const s = sp.get('section'); if (s && SECTIONS.some(x => x.key === s)) setSection(s); }, [sp]);

  const { data: fin, error, isLoading, mutate } = useApi<{ accounts: Acct[]; operations: Op[] }>('/api/v2/finance');
  const { data: clients } = useApi<Client[]>('/api/v2/clients');
  const allAccounts = fin?.accounts || [];
  const accounts = allAccounts.filter(a => (a.section || 'other') === section).sort((a, b) => num(a.sortOrder) - num(b.sortOrder));
  const acctOf = (id: string) => allAccounts.find(a => a.id === id);
  const bankOf = (id: string) => acctOf(id)?.category || 'other';
  const sec = SECTIONS.find(s => s.key === section)!;

  // Доходы раздела → связаны со счетами (банками)
  const sectionIncome = (fin?.operations || []).filter(o => o.opType === 'Приход' && (acctOf(o.accountId)?.section || 'other') === section);
  const byBank = (b: string) => sectionIncome.filter(o => bankOf(o.accountId) === b).reduce((s, o) => s + num(o.amount), 0);
  const total = sectionIncome.reduce((s, o) => s + num(o.amount), 0);
  const income = sectionIncome
    .filter(o => bank === 'all' || bankOf(o.accountId) === bank)
    .filter(o => !q.trim() || `${o.name} ${o.comment} ${o.accountName}`.toLowerCase().includes(q.toLowerCase()));

  const [modal, setModal] = React.useState(false);
  const [f, setF] = React.useState({ name: '', accountId: '', amount: '', date: today(), comment: '', err: '', saving: false });

  function open() { setF({ name: kind || '', accountId: accounts[0]?.id || '', amount: '', date: today(), comment: '', err: '', saving: false }); setModal(true); }
  async function save() {
    const amount = num(f.amount);
    if (amount <= 0) { setF(s => ({ ...s, err: 'Сумма больше 0' })); return; }
    if (!f.accountId) { setF(s => ({ ...s, err: 'Выберите счёт' })); return; }
    setF(s => ({ ...s, saving: true, err: '' }));
    try {
      await apiSend('/api/v2/finance', 'POST', { opType: 'Приход', accountId: f.accountId, amount, name: (f.name.trim() || 'Поступление') + (sec.key === 'other' ? '' : ' · ' + sec.label), source: 'Счета', opDate: f.date, comment: f.comment || null });
      setModal(false); await mutate(); toast('✅ Поступление проведено');
    } catch (e) { setF(s => ({ ...s, err: (e as Error).message, saving: false })); }
  }
  async function exportWord() {
    const rows = income.map(o => [dmy(o.opDate), o.name || '', BANK_LABEL[bankOf(o.accountId)] || '—', o.accountName || acctOf(o.accountId)?.name || '—', fmt(o.amount)]);
    const spec = { titleLines: [`Счета — ${sec.label}`], subtitle: `Поступлений: ${income.length} · всего ${fmt(total)}`, orientation: 'landscape', columns: [{ header: 'Дата', width: 12 }, { header: 'Плательщик / назначение', width: 32, align: 'left' }, { header: 'Банк', width: 12 }, { header: 'Счёт', width: 16 }, { header: 'Сумма', width: 14, align: 'right' }], rows, filename: `Счета_${sec.label}.docx` };
    try { const r = await fetch('/api/v2/docx', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(spec) }); if (!r.ok) throw new Error('Ошибка выгрузки'); const b = await r.blob(); const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(b), download: spec.filename }); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
    catch (e) { toast('⚠️ ' + (e as Error).message); }
  }

  return (
    <div>
      <PageTitle title={`Счета — ${sec.label}`} sub={`№${sec.no} · поступления, связанные со счетами`} action={
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="outline" onClick={exportWord}>⬇ Word</Button>
          <Button onClick={open}>+ Поступление</Button>
        </div>} />

      {/* Поток: источники → счета + настройка связей */}
      <Card className="erp-filters" style={{ gap: 6 }}>
        <span className="erp-muted" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>Источники:</span>
        {(SECTION_SOURCES[section] || []).map(s => <Badge key={s} tone="info">{s}</Badge>)}
        <span style={{ color: '#9ca3af', margin: '0 4px' }}>→</span>
        <span className="erp-muted" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>Счета:</span>
        <Badge tone="warn">🍊 Каспи</Badge><Badge tone="info">🏦 БЦК</Badge><Badge tone="ok">💵 Наличка</Badge>
        <Link href="/erp/finance/accounts" style={{ marginLeft: 'auto', fontSize: 11, color: '#6b7280', border: '1px dashed #d1d5db', borderRadius: 6, padding: '3px 9px', textDecoration: 'none' }}>⚙️ Настроить связи</Link>
      </Card>

      {/* Разделы №1–№4 */}
      <Card className="erp-filters" style={{ marginTop: 12 }}>
        <div className="erp-chips">{SECTIONS.map(s => <button key={s.key} className={`erp-chip${section === s.key ? ' on' : ''}`} style={section === s.key ? { background: s.color, borderColor: s.color, color: '#fff' } : undefined} onClick={() => setSection(s.key)}>№{s.no} {s.label}</button>)}</div>
      </Card>

      {/* Сводка по счетам (банкам) */}
      <div className="erp-kpi-grid" style={{ marginTop: 12 }}>
        <div className="erp-kpi"><div className="erp-kpi-top"><span className="erp-kpi-ico">📊</span><span className="erp-kpi-label">Итого</span></div><div className="erp-kpi-val">{fmt(total)}</div></div>
        <div className="erp-kpi"><div className="erp-kpi-top"><span className="erp-kpi-ico">🍊</span><span className="erp-kpi-label">Каспи</span></div><div className="erp-kpi-val">{fmt(byBank('kaspi'))}</div></div>
        <div className="erp-kpi"><div className="erp-kpi-top"><span className="erp-kpi-ico">🏦</span><span className="erp-kpi-label">БЦК</span></div><div className="erp-kpi-val">{fmt(byBank('bck'))}</div></div>
        <div className="erp-kpi"><div className="erp-kpi-top"><span className="erp-kpi-ico">💵</span><span className="erp-kpi-label">Наличка</span></div><div className="erp-kpi-val">{fmt(byBank('nalichka'))}</div></div>
      </div>

      {/* Вкладки по счетам + поиск */}
      <Card className="erp-filters" style={{ marginTop: 12 }}>
        <div className="erp-chips">{BANKS.map(b => <button key={b.key} className={`erp-chip${bank === b.key ? ' on' : ''}`} onClick={() => setBank(b.key)}>{b.label}</button>)}</div>
        <Input placeholder="🔍 Плательщик, назначение" value={q} onChange={e => setQ(e.target.value)} />
      </Card>

      <Card style={{ marginTop: 12, padding: 0, overflowX: 'auto' }}>
        {error ? <EmptyRow>Нет доступа к финансам.</EmptyRow> : isLoading ? <EmptyRow>Загрузка…</EmptyRow> : income.length === 0 ? <EmptyRow>Поступлений нет. Нажмите «+ Поступление».</EmptyRow> : (
          <table className="erp-table">
            <thead><tr><th>Дата</th><th>Плательщик / назначение</th><th>Банк</th><th>Счёт</th><th style={{ textAlign: 'right' }}>Сумма</th></tr></thead>
            <tbody>{income.map(o => (
              <tr key={o.id}>
                <td className="erp-muted" style={{ fontSize: 12 }}>{dmy(o.opDate)}</td>
                <td className="erp-td-main">{o.name}{o.comment && <div className="erp-td-sub">{o.comment}</div>}</td>
                <td style={{ fontSize: 12 }}>{BANK_LABEL[bankOf(o.accountId)] || '—'}</td>
                <td style={{ fontSize: 12 }}>{o.accountName || acctOf(o.accountId)?.name || '—'}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: '#16a34a' }}>+{fmt(o.amount)}</td>
              </tr>
            ))}</tbody>
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
        <Field label="Счёт зачисления (банк)" required><Select value={f.accountId} onChange={e => setF({ ...f, accountId: e.target.value })}><option value="">— выберите —</option>{accounts.map((a, i) => <option key={a.id} value={a.id}>№{i + 1} {a.icon} {a.name} · {BANK_LABEL[a.category || 'other']}</option>)}</Select></Field>
        <Field label="Комментарий"><Input value={f.comment} onChange={e => setF({ ...f, comment: e.target.value })} /></Field>
      </Modal>
    </div>
  );
}

export default function InvoicesPage() {
  return <React.Suspense fallback={<div className="erp-muted" style={{ padding: 20 }}>Загрузка…</div>}><InvoicesInner /></React.Suspense>;
}
