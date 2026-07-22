'use client';
import * as React from 'react';
import { useApi } from '@/lib/api';
import { Card, PageTitle, Input, EmptyRow } from '@/components/ui';

type Op = { id: string; opType: string; amount: string | number; opDate?: string | null; name?: string | null; accountName?: string | null; source?: string | null };
const num = (v: unknown) => Number(v) || 0;
const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU') + ' ₸';
const monthStart = () => new Date().toISOString().slice(0, 8) + '01';
const today = () => new Date().toISOString().slice(0, 10);

function groupSum(ops: Op[], key: (o: Op) => string) {
  const m: Record<string, { sum: number; n: number }> = {};
  ops.forEach(o => { const k = key(o) || '—'; (m[k] ||= { sum: 0, n: 0 }); m[k].sum += num(o.amount); m[k].n++; });
  return Object.entries(m).map(([k, v]) => ({ k, ...v })).sort((a, b) => b.sum - a.sum);
}

export default function ExpenseAnalyticsPage() {
  const [from, setFrom] = React.useState(monthStart());
  const [to, setTo] = React.useState(today());
  const qs = new URLSearchParams(); if (from) qs.set('from', from); if (to) qs.set('to', to);
  const { data, error, isLoading } = useApi<{ operations: Op[] }>('/api/v2/finance?' + qs);
  const expenses = (data?.operations || []).filter(o => o.opType !== 'Приход');
  const total = expenses.reduce((s, o) => s + num(o.amount), 0);
  const bySource = groupSum(expenses, o => o.source || 'Прочее');
  const byAccount = groupSum(expenses, o => o.accountName || '—');
  const maxSrc = Math.max(1, ...bySource.map(x => x.sum));

  const Table = ({ title, rows }: { title: string; rows: Array<{ k: string; sum: number; n: number }> }) => (
    <Card style={{ padding: 0, overflowX: 'auto' }}>
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--erp-line)', fontWeight: 700, fontSize: 14 }}>{title}</div>
      {rows.length === 0 ? <EmptyRow>Нет данных за период.</EmptyRow> : (
        <table className="erp-table">
          <thead><tr><th>Наименование</th><th style={{ textAlign: 'right' }}>Кол-во</th><th style={{ textAlign: 'right' }}>Сумма</th><th style={{ textAlign: 'right' }}>%</th></tr></thead>
          <tbody>{rows.map(r => (
            <tr key={r.k}><td className="erp-td-main">{r.k}</td><td style={{ textAlign: 'right' }}>{r.n}</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(r.sum)}</td><td style={{ textAlign: 'right' }} className="erp-muted">{total ? Math.round((r.sum / total) * 100) : 0}%</td></tr>
          ))}</tbody>
        </table>
      )}
    </Card>
  );

  return (
    <div>
      <PageTitle title="Аналитика расходов" sub="Сводные данные по источникам и счетам за период" />
      <Card className="erp-filters">
        <label className="erp-check">с <Input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ width: 150 }} /></label>
        <label className="erp-check">по <Input type="date" value={to} onChange={e => setTo(e.target.value)} style={{ width: 150 }} /></label>
      </Card>

      {error ? <Card style={{ marginTop: 12 }}><EmptyRow>Нет доступа к финансам.</EmptyRow></Card>
        : isLoading ? <Card style={{ marginTop: 12 }}><EmptyRow>Загрузка…</EmptyRow></Card>
        : (
          <>
            <div className="erp-kpi-grid" style={{ marginTop: 12 }}>
              <div className="erp-kpi"><div className="erp-kpi-top"><span className="erp-kpi-ico">📤</span><span className="erp-kpi-label">Всего расходов</span></div><div className="erp-kpi-val" style={{ color: '#dc2626' }}>{fmt(total)}</div></div>
              <div className="erp-kpi"><div className="erp-kpi-top"><span className="erp-kpi-ico">🧾</span><span className="erp-kpi-label">Операций</span></div><div className="erp-kpi-val">{expenses.length}</div></div>
              <div className="erp-kpi"><div className="erp-kpi-top"><span className="erp-kpi-ico">📊</span><span className="erp-kpi-label">Средний расход</span></div><div className="erp-kpi-val">{fmt(expenses.length ? total / expenses.length : 0)}</div></div>
            </div>

            <Card style={{ marginTop: 12 }}>
              <h3 style={{ margin: '0 0 10px' }}>По источникам</h3>
              {bySource.map(x => (
                <div key={x.k} style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '5px 0', fontSize: 13 }}>
                  <span style={{ width: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.k}</span>
                  <span style={{ flex: 1, background: '#f1f5f9', borderRadius: 4, height: 12 }}><span style={{ display: 'block', height: '100%', width: `${(x.sum / maxSrc) * 100}%`, background: '#dc2626', borderRadius: 4 }} /></span>
                  <span style={{ width: 110, textAlign: 'right', fontWeight: 600 }}>{fmt(x.sum)}</span>
                </div>
              ))}
              {bySource.length === 0 && <div className="erp-muted">Нет расходов за период.</div>}
            </Card>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 12, marginTop: 12 }}>
              <Table title="По источникам" rows={bySource} />
              <Table title="По счетам" rows={byAccount} />
            </div>
          </>
        )}
    </div>
  );
}
