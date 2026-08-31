'use client';
import * as React from 'react';
import { useApi } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { Card, PageTitle, EmptyRow, DateRange } from '@/components/ui';
import { opIcon, opName, opSign, opAmountColor, isReversed } from '@/lib/opDisplay';

type Acct = { id: string; name: string; icon?: string | null; section?: string | null; balance?: string | number | null };
type Op = { id: string; opType: string; accountId: string; accountName?: string | null; amount: string | number; opDate?: string | null; name?: string | null; source?: string | null; reverses?: string | null; reversedAt?: string | null; createdByName?: string | null };
type Resp = { section: string; branchId: string; accounts: Acct[]; operations: Op[]; accountNo: Record<string, number>; total: number; income: number; expense: number };

const fmt = (n: number | string) => (Number(n) || 0).toLocaleString('ru-RU');
const dmy = (d?: string | null) => formatDate(d);

// Кабинет филиала: только свой счёт, свои движения. Компанейские данные сюда не
// приходят (изоляция на сервере — /api/v2/branch/finance отдаёт лишь свой раздел).
export default function BranchFinancePage() {
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const qs = new URLSearchParams(); if (from) qs.set('from', from); if (to) qs.set('to', to);
  const { data, error, isLoading } = useApi<Resp>('/api/v2/branch/finance' + (qs.toString() ? '?' + qs : ''));
  const [tab, setTab] = React.useState<'all' | 'expense' | 'transfer' | 'income'>('all');

  const accounts = data?.accounts || [];
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

  return (
    <div>
      <PageTitle title="Финансы филиала" sub="Ваш счёт, расходы и переводы — только по вашему филиалу" />

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
        Показаны только операции вашего филиала. Входящие переводы от головного офиса отражаются в балансе; отдельной строкой они появятся после доработки (Этап 3).
      </p>
    </div>
  );
}
