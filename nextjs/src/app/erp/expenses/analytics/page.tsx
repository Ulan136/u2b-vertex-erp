'use client';
import * as React from 'react';
import { useApi } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { Card, PageTitle, Input, Button, EmptyRow } from '@/components/ui';

type Op = { id: string; opType: string; amount: string | number; opDate?: string | null; name?: string | null; accountName?: string | null; source?: string | null; expenseCat?: string | null; subCategory?: string | null; createdByName?: string | null; reverses?: string | null; reversedAt?: string | null };
const num = (v: unknown) => Number(v) || 0;
const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU') + ' ₸';
const monthStart = () => new Date().toISOString().slice(0, 8) + '01';
const today = () => new Date().toISOString().slice(0, 10);
const shiftDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const dmy = (d?: string | null) => formatDate(d) || '—';
const catOf = (o: Op) => o.expenseCat || (o.source === 'Зарплата' ? 'Зарплата' : (o.name || '').split(':')[0].trim() || 'Прочие');
const subOf = (o: Op) => (o.subCategory || '').trim();
const authorOf = (o: Op) => (o.createdByName || '').trim() || '— без автора';

function groupSum(ops: Op[], key: (o: Op) => string) {
  const m: Record<string, { sum: number; n: number }> = {};
  ops.forEach(o => { const k = key(o) || '—'; (m[k] ||= { sum: 0, n: 0 }); m[k].sum += num(o.amount); m[k].n++; });
  return Object.entries(m).map(([k, v]) => ({ k, ...v })).sort((a, b) => b.sum - a.sum);
}

export default function ExpenseAnalyticsPage() {
  const [from, setFrom] = React.useState(monthStart());
  const [to, setTo] = React.useState(today());
  const [q, setQ] = React.useState('');
  const [emp, setEmp] = React.useState('');   // выбранный сотрудник (клик по строке) → детализация по дням
  const qs = new URLSearchParams(); if (from) qs.set('from', from); if (to) qs.set('to', to);
  const { data, error, isLoading } = useApi<{ operations: Op[] }>('/api/v2/finance?' + qs);

  // Расходы за период: только Расход, без сторно/отменённых.
  const all = React.useMemo(() => (data?.operations || []).filter(o => o.opType === 'Расход' && !o.reversedAt && !o.reverses), [data]);
  // Умный поиск: по сотруднику, категории, подкатегории, описанию (слова через AND).
  const expenses = React.useMemo(() => {
    const qn = q.trim().toLowerCase();
    if (!qn) return all;
    const words = qn.split(/\s+/);
    return all.filter(o => { const hay = `${authorOf(o)} ${catOf(o)} ${subOf(o)} ${o.name || ''}`.toLowerCase(); return words.every(w => hay.includes(w)); });
  }, [all, q]);

  const total = expenses.reduce((s, o) => s + num(o.amount), 0);
  const byEmployee = groupSum(expenses, authorOf);
  const byCategory = groupSum(expenses, catOf);
  const bySub = groupSum(expenses.filter(subOf), o => `${catOf(o)} · ${subOf(o)}`);
  const byAccount = groupSum(expenses, o => o.accountName || '—');
  const byDay = groupSum(expenses, o => (o.opDate || '').slice(0, 10)).sort((a, b) => b.k.localeCompare(a.k));
  const maxEmp = Math.max(1, ...byEmployee.map(x => x.sum));

  // Детализация выбранного сотрудника — по дням (за какие дни сколько).
  const empDays = React.useMemo(() => emp ? groupSum(expenses.filter(o => authorOf(o) === emp), o => (o.opDate || '').slice(0, 10)).sort((a, b) => b.k.localeCompare(a.k)) : [], [expenses, emp]);
  const empTotal = empDays.reduce((s, d) => s + d.sum, 0);

  const Table = ({ title, rows, onRow, activeKey, dateKey }: { title: string; rows: Array<{ k: string; sum: number; n: number }>; onRow?: (k: string) => void; activeKey?: string; dateKey?: boolean }) => (
    <Card className="erp-journal" style={{ padding: 0 }}>
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--erp-line)', fontWeight: 700, fontSize: 14 }}>{title}</div>
      {rows.length === 0 ? <EmptyRow>Нет данных за период.</EmptyRow> : (
        <table className="erp-table">
          <thead><tr><th>{dateKey ? 'Дата' : 'Наименование'}</th><th style={{ textAlign: 'right' }}>Кол-во</th><th style={{ textAlign: 'right' }}>Сумма</th><th style={{ textAlign: 'right' }}>%</th></tr></thead>
          <tbody>{rows.map(r => (
            <tr key={r.k} onClick={onRow ? () => onRow(r.k) : undefined} style={{ cursor: onRow ? 'pointer' : undefined, background: activeKey === r.k ? '#eff6ff' : undefined }}>
              <td className="erp-td-main">{dateKey ? dmy(r.k) : r.k}</td>
              <td style={{ textAlign: 'right' }}>{r.n}</td>
              <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(r.sum)}</td>
              <td style={{ textAlign: 'right' }} className="erp-muted">{total ? Math.round((r.sum / total) * 100) : 0}%</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </Card>
  );

  return (
    <div>
      <PageTitle title="Аналитика расходов" sub="Кто сколько потратил — по сотрудникам, дням, категориям" />
      <Card className="erp-filters" style={{ flexWrap: 'wrap', gap: 8 }}>
        <label className="erp-check">с <Input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ width: 150 }} /></label>
        <label className="erp-check">по <Input type="date" value={to} onChange={e => setTo(e.target.value)} style={{ width: 150 }} /></label>
        <Button variant="outline" onClick={() => { setFrom(today()); setTo(today()); }}>Сегодня</Button>
        <Button variant="outline" onClick={() => { setFrom(shiftDays(1)); setTo(shiftDays(1)); }}>Вчера</Button>
        <Button variant="outline" onClick={() => { setFrom(monthStart()); setTo(today()); }}>Текущий месяц</Button>
        <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 Сотрудник / категория / описание" style={{ width: 260, paddingRight: q ? 26 : undefined }} />
          {q && <button type="button" className="erp-icon-btn" onClick={() => setQ('')} title="Очистить" style={{ position: 'absolute', right: 2, color: '#94a3b8' }}>✕</button>}
        </div>
      </Card>

      {error ? <Card style={{ marginTop: 12 }}><EmptyRow>Нет доступа к финансам.</EmptyRow></Card>
        : isLoading ? <Card style={{ marginTop: 12 }}><EmptyRow>Загрузка…</EmptyRow></Card>
        : (
          <>
            <div className="erp-kpi-grid" style={{ marginTop: 12 }}>
              <div className="erp-kpi"><div className="erp-kpi-top"><span className="erp-kpi-ico">📤</span><span className="erp-kpi-label">Всего расходов</span></div><div className="erp-kpi-val" style={{ color: '#dc2626' }}>{fmt(total)}</div></div>
              <div className="erp-kpi"><div className="erp-kpi-top"><span className="erp-kpi-ico">👥</span><span className="erp-kpi-label">Сотрудников</span></div><div className="erp-kpi-val">{byEmployee.length}</div></div>
              <div className="erp-kpi"><div className="erp-kpi-top"><span className="erp-kpi-ico">🧾</span><span className="erp-kpi-label">Операций</span></div><div className="erp-kpi-val">{expenses.length}</div></div>
              <div className="erp-kpi"><div className="erp-kpi-top"><span className="erp-kpi-ico">📊</span><span className="erp-kpi-label">Средний расход</span></div><div className="erp-kpi-val">{fmt(expenses.length ? total / expenses.length : 0)}</div></div>
            </div>

            <Card style={{ marginTop: 12 }}>
              <h3 style={{ margin: '0 0 10px' }}>👥 По сотрудникам — кто сколько потратил</h3>
              {byEmployee.length === 0 ? <div className="erp-muted">Нет расходов за период.</div> : byEmployee.map(x => (
                <div key={x.k} onClick={() => setEmp(emp === x.k ? '' : x.k)} style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '6px 0', fontSize: 13, cursor: 'pointer', background: emp === x.k ? '#eff6ff' : undefined, borderRadius: 6, padding: '2px 4px' }} title="Нажмите — детализация по дням">
                  <span style={{ width: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={x.k}>{emp === x.k ? '▾ ' : '▸ '}{x.k}</span>
                  <span style={{ flex: 1, background: '#f1f5f9', borderRadius: 4, height: 14 }}><span style={{ display: 'block', height: '100%', width: `${(x.sum / maxEmp) * 100}%`, background: '#2563eb', borderRadius: 4 }} /></span>
                  <span className="erp-muted" style={{ width: 40, textAlign: 'right', fontSize: 11 }}>{x.n} оп.</span>
                  <span style={{ width: 120, textAlign: 'right', fontWeight: 700 }}>{fmt(x.sum)}</span>
                  <span style={{ width: 42, textAlign: 'right' }} className="erp-muted">{total ? Math.round((x.sum / total) * 100) : 0}%</span>
                </div>
              ))}
              {emp && (
                <div style={{ marginTop: 10, borderTop: '1px dashed var(--erp-line)', paddingTop: 10 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>📅 {emp} · по дням · итого {fmt(empTotal)}</div>
                  {empDays.length === 0 ? <div className="erp-muted">Нет данных.</div> : (
                    <table className="erp-table" style={{ fontSize: 13 }}>
                      <thead><tr><th>Дата</th><th style={{ textAlign: 'right' }}>Операций</th><th style={{ textAlign: 'right' }}>Сумма</th></tr></thead>
                      <tbody>{empDays.map(d => <tr key={d.k}><td className="erp-muted">{dmy(d.k)}</td><td style={{ textAlign: 'right' }}>{d.n}</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(d.sum)}</td></tr>)}</tbody>
                    </table>
                  )}
                </div>
              )}
            </Card>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 12, marginTop: 12 }}>
              <Table title="👥 По сотрудникам" rows={byEmployee} onRow={k => setEmp(emp === k ? '' : k)} activeKey={emp} />
              <Table title="📅 По дням" rows={byDay} dateKey />
              <Table title="🗂 По категориям" rows={byCategory} />
              <Table title="↳ По подкатегориям" rows={bySub} />
              <Table title="💳 По счетам списания" rows={byAccount} />
            </div>
          </>
        )}
    </div>
  );
}
