'use client';
import * as React from 'react';
import { formatDate } from '@/lib/format';
import { useApi } from '@/lib/api';
import { toast } from '@/lib/toast';
import { Card, Badge, Button, PageTitle, Input } from '@/components/ui';
import { periodRange } from '@/server/dto/reports.dto';
import { isRealIncome, isRealExpense } from '@/server/dto/finance.dto';
import { ROLE_LABELS_RU, type Role } from '@/server/dto/permissions.dto';

type Op = { opType: string; amount: string | number; opDate?: string | null; reverses?: string | null; reversedAt?: string | null };
type Acct = { section?: string | null; balance?: string | number | null };
type SaleLite = { totalSum?: string | number; payStatus?: string | null };
type Debt = { type: string; amount: string | number; paidAmount: string | number; status: string };
type Cert = { source: string };
type EmpRow = { userId: string; name: string; role: string; salesCount: number; salesSum: number; certCount: number; certBySource: Record<string, number>; ordersClosed: number; tasksDone: number; expenseSum: number; totalActions: number };
type Dyn = { day: string; salesSum: number; certCount: number };
type Analytics = { from: string; to: string; employees: EmpRow[]; dynamics: Dyn[] };
type Activity = { action: string; entityType: string | null; entityLabel: string | null; createdAt: string };

const fmt = (n: number) => Math.round(Number(n) || 0).toLocaleString('ru-RU');
const fmtT = (n: number) => fmt(n) + ' ₸';
const dmy = (d?: string | null) => formatDate(d);
const hm = (d?: string | null) => (d ? new Date(d).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '');
const roleRu = (r: string) => ROLE_LABELS_RU[r as Role] || r;
const SECTIONS = [{ k: 'poverka', l: '№1 Поверка' }, { k: 'sale', l: '№2 Продажа' }, { k: 'branch', l: '№3 Филиалы' }, { k: 'other', l: '№4 Прочие' }];
const PRESETS: Array<{ k: string; l: string }> = [{ k: 'today', l: 'Сегодня' }, { k: '7d', l: '7 дней' }, { k: 'month', l: 'Месяц' }, { k: 'quarter', l: 'Квартал' }, { k: 'custom', l: 'Период…' }];
const CERT_SRC = ['САМИ', 'ВДК', 'ТЭЦ'];
const SRC_COLOR: Record<string, string> = { 'САМИ': '#2563eb', 'ВДК': '#16a34a', 'ТЭЦ': '#b45309' };
const ACT: Record<string, string> = { created: '➕ создал', updated: '✏️ изменил', deleted: '🗑 удалил', cancelled: '↩️ отменил', reversed: '↩️ сторно', payment: '💵 оплата', status_changed: '🔁 статус', login: '🔑 вход' };
const ENT: Record<string, string> = { sale: 'продажа', order: 'заявка', certificate: 'сертификат', operation: 'финоперация', debt: 'долг', debt_payment: 'платёж по долгу', task: 'задача', client: 'клиент', user: 'пользователь', document: 'документ', stock: 'склад', permissions: 'доступы', org: 'реквизиты', branch: 'филиал' };

type SortKey = 'name' | 'role' | 'salesSum' | 'certCount' | 'ordersClosed' | 'tasksDone' | 'expenseSum' | 'totalActions';

export default function ReportsPage() {
  const [period, setPeriod] = React.useState<{ preset: string; from: string; to: string }>({ preset: 'month', from: '', to: '' });
  const range = React.useMemo(() => periodRange({ preset: period.preset, from: period.from, to: period.to }, new Date().toISOString().slice(0, 10)), [period]);
  const qs = `from=${range.from}&to=${range.to}`;

  const { data: fin } = useApi<{ accounts: Acct[]; operations: Op[] }>(`/api/v2/finance?${qs}`);
  const { data: sales } = useApi<SaleLite[]>('/api/v2/sales');
  const { data: debts } = useApi<Debt[]>('/api/v2/debts');
  const { data: certs } = useApi<Cert[]>('/api/v2/certs?type=cert&archived=false');
  const { data: analytics, error: aErr, isLoading: aLoading } = useApi<Analytics>(`/api/v2/reports/analytics?${qs}`);
  const { data: debtPays } = useApi<Array<{ amount: number; debtType: string }>>(`/api/v2/debts/payments?${qs}`);
  const repayCredit = (debtPays || []).filter(p => p.debtType === 'credit').reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const repayDebit = (debtPays || []).filter(p => p.debtType === 'debit').reduce((s, p) => s + (Number(p.amount) || 0), 0);

  const accs = fin?.accounts || [], ops = fin?.operations || [];
  const cash = accs.reduce((s, a) => s + (Number(a.balance) || 0), 0);
  const inc = ops.filter(isRealIncome).reduce((s, o) => s + (Number(o.amount) || 0), 0);
  const exp = ops.filter(isRealExpense).reduce((s, o) => s + (Number(o.amount) || 0), 0);
  const salesSum = (sales || []).reduce((s, x) => s + (Number(x.totalSum) || 0), 0);
  const salesPaid = (sales || []).filter(s => s.payStatus === 'Оплачено').reduce((s, x) => s + (Number(x.totalSum) || 0), 0);
  const recv = (debts || []).filter(d => d.type === 'debit' && d.status !== 'closed').reduce((s, d) => s + Math.max(0, (Number(d.amount) || 0) - (Number(d.paidAmount) || 0)), 0);
  const payable = (debts || []).filter(d => d.type === 'credit' && d.status !== 'closed').reduce((s, d) => s + Math.max(0, (Number(d.amount) || 0) - (Number(d.paidAmount) || 0)), 0);
  const certBySrc: Record<string, number> = {};
  (certs || []).forEach(c => { certBySrc[c.source] = (certBySrc[c.source] || 0) + 1; });

  // ── таблица сотрудников: сортировка + раскрытие ──
  const [sortKey, setSortKey] = React.useState<SortKey>('totalActions');
  const [sortDir, setSortDir] = React.useState<1 | -1>(-1);
  const [openUser, setOpenUser] = React.useState<string | null>(null);
  function sortBy(k: SortKey) { if (k === sortKey) setSortDir(d => (d === 1 ? -1 : 1)); else { setSortKey(k); setSortDir(k === 'name' || k === 'role' ? 1 : -1); } }
  const emps = React.useMemo(() => {
    const rows = [...(analytics?.employees || [])];
    rows.sort((a, b) => {
      const av = a[sortKey] as number | string, bv = b[sortKey] as number | string;
      if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv) * sortDir;
      return ((Number(av) || 0) - (Number(bv) || 0)) * sortDir;
    });
    return rows;
  }, [analytics, sortKey, sortDir]);
  const arrow = (k: SortKey) => sortKey === k ? <span className="rep-sort">{sortDir === 1 ? '▲' : '▼'}</span> : null;

  const { data: activity } = useApi<Activity[]>(openUser ? `/api/v2/reports/employee-activity?userId=${openUser}&${qs}` : null);
  const activityByDay = React.useMemo(() => {
    const m: Record<string, Activity[]> = {};
    (activity || []).forEach(a => { const d = String(a.createdAt).slice(0, 10); (m[d] ||= []).push(a); });
    return Object.entries(m).sort((a, b) => b[0].localeCompare(a[0]));
  }, [activity]);

  // ── диаграммы ──
  const salesRank = React.useMemo(() => emps.filter(e => e.salesSum > 0).sort((a, b) => b.salesSum - a.salesSum), [emps]);
  const maxSales = Math.max(1, ...salesRank.map(e => e.salesSum));
  const certRank = React.useMemo(() => emps.filter(e => e.certCount > 0).sort((a, b) => b.certCount - a.certCount), [emps]);
  const maxCert = Math.max(1, ...certRank.map(e => e.certCount));
  const dynamics = analytics?.dynamics || [];
  const maxDaySales = Math.max(1, ...dynamics.map(d => d.salesSum));

  async function exportExcel() {
    try {
      const r = await fetch(`/api/v2/reports/export?${qs}`);
      if (!r.ok) throw new Error('Ошибка выгрузки');
      const b = await r.blob(); const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(b), download: `Работа_сотрудников_${range.from}_${range.to}.xlsx` });
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (e) { toast('⚠️ ' + (e as Error).message); }
  }

  const Kpi = ({ i, l, v, c }: { i: string; l: string; v: string; c?: string }) => <div className="erp-kpi"><div className="erp-kpi-top"><span className="erp-kpi-ico">{i}</span><span className="erp-kpi-label">{l}</span></div><div className="erp-kpi-val" style={c ? { color: c } : undefined}>{v}</div></div>;

  return (
    <div>
      <PageTitle title="Отчёты" sub={`Аналитика по сотрудникам · период ${dmy(range.from)}–${dmy(range.to)}`} action={<Button variant="outline" onClick={exportExcel}>⬇ Excel</Button>} />

      {/* Фильтр периода */}
      <Card className="erp-filters" style={{ flexWrap: 'wrap', gap: 8 }}>
        <span className="erp-muted" style={{ fontSize: 12, fontWeight: 600 }}>📅 Период:</span>
        <div className="erp-chips">
          {PRESETS.map(p => <button key={p.k} className={`erp-chip${period.preset === p.k ? ' on' : ''}`} onClick={() => setPeriod(s => ({ ...s, preset: p.k }))}>{p.l}</button>)}
        </div>
        {period.preset === 'custom' && (<>
          <Input type="date" value={period.from} onChange={e => setPeriod(s => ({ ...s, from: e.target.value }))} style={{ width: 150 }} />
          <span className="erp-muted">—</span>
          <Input type="date" value={period.to} onChange={e => setPeriod(s => ({ ...s, to: e.target.value }))} style={{ width: 150 }} />
        </>)}
      </Card>

      {/* Существующие сводки */}
      <div className="erp-kpi-grid" style={{ marginTop: 12 }}>
        <Kpi i="💳" l="Касса (сейчас)" v={fmtT(cash)} />
        <Kpi i="📥" l="Приход (период)" v={fmtT(inc)} c="#16a34a" />
        <Kpi i="📤" l="Расход (период)" v={fmtT(exp)} c="#dc2626" />
        <Kpi i="💰" l="Продажи (оплач./всего)" v={`${fmt(salesPaid)} / ${fmt(salesSum)}`} />
        <Kpi i="💸" l="Мы должны (остаток)" v={fmtT(payable)} c="#dc2626" />
        <Kpi i="🧾" l="Нам должны (остаток)" v={fmtT(recv)} />
      </div>

      <Card style={{ marginTop: 12 }}>
        <h3>💵 Погашения долгов за период</h3>
        <div className="erp-sections">
          <div className="erp-sec-row"><span className="erp-sec-label">📤 Мы выплатили (по кредиторке)</span><span className="erp-sec-val" style={{ color: '#dc2626' }}>{fmtT(repayCredit)}</span></div>
          <div className="erp-sec-row"><span className="erp-sec-label">📥 Нам вернули (по дебиторке)</span><span className="erp-sec-val" style={{ color: '#16a34a' }}>{fmtT(repayDebit)}</span></div>
        </div>
      </Card>

      {/* БЛОК 2 — Работа сотрудников за период */}
      <Card style={{ marginTop: 12, padding: 0, overflowX: 'auto' }}>
        <div style={{ padding: '12px 14px', fontWeight: 700 }}>👥 Работа сотрудников за период</div>
        {aErr ? <div className="erp-muted" style={{ padding: 14 }}>Нет доступа к отчётам.</div>
          : aLoading ? <div className="erp-muted" style={{ padding: 14 }}>Загрузка…</div>
          : emps.length === 0 ? <div className="erp-muted" style={{ padding: 14 }}>Нет данных за период.</div>
          : (
            <table className="erp-table">
              <thead><tr>
                <th className="rep-th" onClick={() => sortBy('name')}>Сотрудник {arrow('name')}</th>
                <th className="rep-th" onClick={() => sortBy('role')}>Роль {arrow('role')}</th>
                <th className="rep-th" style={{ textAlign: 'right' }} onClick={() => sortBy('salesSum')}>Продажи (шт / ₸) {arrow('salesSum')}</th>
                <th className="rep-th" style={{ textAlign: 'right' }} onClick={() => sortBy('certCount')}>Сертификаты {arrow('certCount')}</th>
                <th className="rep-th" style={{ textAlign: 'right' }} onClick={() => sortBy('ordersClosed')}>Заявки {arrow('ordersClosed')}</th>
                <th className="rep-th" style={{ textAlign: 'right' }} onClick={() => sortBy('tasksDone')}>Задачи {arrow('tasksDone')}</th>
                <th className="rep-th" style={{ textAlign: 'right' }} onClick={() => sortBy('expenseSum')}>Расходы, ₸ {arrow('expenseSum')}</th>
                <th className="rep-th" style={{ textAlign: 'right' }} onClick={() => sortBy('totalActions')}>Всего действий {arrow('totalActions')}</th>
              </tr></thead>
              <tbody>
                {emps.map(e => (
                  <React.Fragment key={e.userId}>
                    <tr className="rep-emp-row" onClick={() => setOpenUser(openUser === e.userId ? null : e.userId)}>
                      <td className="erp-td-main">{openUser === e.userId ? '▾ ' : '▸ '}{e.name}</td>
                      <td><Badge tone="neutral">{roleRu(e.role)}</Badge></td>
                      <td style={{ textAlign: 'right' }}>{e.salesCount} <span className="erp-muted">/</span> <b>{fmt(e.salesSum)}</b></td>
                      <td style={{ textAlign: 'right' }}>{e.certCount || '—'}</td>
                      <td style={{ textAlign: 'right' }}>{e.ordersClosed || '—'}</td>
                      <td style={{ textAlign: 'right' }}>{e.tasksDone || '—'}</td>
                      <td style={{ textAlign: 'right' }}>{e.expenseSum ? fmt(e.expenseSum) : '—'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{e.totalActions}</td>
                    </tr>
                    {openUser === e.userId && (
                      <tr className="rep-detail"><td colSpan={8}>
                        <div className="rep-feed">
                          {!activity ? <span className="erp-muted">Загрузка ленты…</span>
                            : activityByDay.length === 0 ? <span className="erp-muted">Действий за период нет.</span>
                            : activityByDay.map(([day, items]) => (
                              <div key={day}>
                                <div className="rep-feed-day">{dmy(day)} · {items.length}</div>
                                {items.map((a, i) => (
                                  <div className="rep-feed-item" key={i}>
                                    <span className="rep-feed-time">{hm(a.createdAt)}</span>
                                    <span>{ACT[a.action] || a.action} {a.entityType ? <span className="erp-muted">{ENT[a.entityType] || a.entityType}</span> : ''} {a.entityLabel && <b>{a.entityLabel}</b>}</span>
                                  </div>
                                ))}
                              </div>
                            ))}
                        </div>
                      </td></tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
      </Card>

      {/* БЛОК 3 — Продажи + Сертификаты по сотрудникам */}
      <div className="erp-panels" style={{ marginTop: 12 }}>
        <Card>
          <h3>💰 Продажи по сотрудникам</h3>
          {salesRank.length === 0 ? <p className="erp-muted">Нет продаж за период.</p> : (
            <div className="rep-barlist">
              {salesRank.map(e => (
                <div className="rep-bar-row" key={e.userId}>
                  <span title={e.name} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</span>
                  <div className="rep-bar-track"><div className="rep-bar-fill" style={{ width: `${(e.salesSum / maxSales) * 100}%`, background: '#16a34a' }} /></div>
                  <span className="rep-bar-val">{fmt(e.salesSum)} ₸ <span className="erp-muted">· {e.salesCount}</span></span>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card>
          <h3>📋 Сертификаты по сотрудникам</h3>
          {certRank.length === 0 ? <p className="erp-muted">Нет сертификатов за период.</p> : (<>
            <div className="rep-barlist">
              {certRank.map(e => (
                <div className="rep-bar-row" key={e.userId}>
                  <span title={e.name} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</span>
                  <div className="rep-bar-track">
                    {CERT_SRC.concat(Object.keys(e.certBySource).filter(s => !CERT_SRC.includes(s))).map(src => {
                      const n = e.certBySource[src] || 0; if (!n) return null;
                      return <div className="rep-bar-seg" key={src} title={`${src}: ${n}`} style={{ width: `${(n / maxCert) * 100}%`, background: SRC_COLOR[src] || '#94a3b8' }} />;
                    })}
                  </div>
                  <span className="rep-bar-val">{e.certCount}</span>
                </div>
              ))}
            </div>
            <div className="rep-legend">{CERT_SRC.map(s => <span key={s}><span className="rep-dot" style={{ background: SRC_COLOR[s] }} />{s}</span>)}</div>
          </>)}
        </Card>
      </div>

      {/* БЛОК 4 — Динамика по дням */}
      <Card style={{ marginTop: 12 }}>
        <h3>📈 Динамика по дням</h3>
        {dynamics.length === 0 ? <p className="erp-muted">Нет данных за период.</p> : (<>
          <div className="rep-day-chart">
            {dynamics.map(d => (
              <div className="rep-day-col" key={d.day} title={`${dmy(d.day)}: продажи ${fmt(d.salesSum)} ₸, сертификаты ${d.certCount}`}>
                {d.certCount > 0 && <span className="rep-day-cert">{d.certCount}</span>}
                <div className="rep-day-bar" style={{ height: `${Math.max(2, (d.salesSum / maxDaySales) * 130)}px` }} />
                <span className="rep-day-lbl">{String(d.day).slice(8, 10)}.{String(d.day).slice(5, 7)}</span>
              </div>
            ))}
          </div>
          <div className="rep-legend"><span><span className="rep-dot" style={{ background: '#16a34a' }} />Продажи, ₸ (высота)</span><span><span className="rep-dot" style={{ background: '#2563eb' }} />Сертификаты, шт (число сверху)</span></div>
        </>)}
      </Card>

      {/* Существующие панели-сводки */}
      <div className="erp-panels" style={{ marginTop: 12 }}>
        <Card>
          <h3>💳 Баланс по разделам</h3>
          <div className="erp-sections">{SECTIONS.map(s => <div className="erp-sec-row" key={s.k}><span className="erp-sec-label">{s.l}</span><span className="erp-sec-val">{fmtT(accs.filter(a => (a.section || 'other') === s.k).reduce((x, a) => x + (Number(a.balance) || 0), 0))}</span></div>)}</div>
        </Card>
        <Card>
          <h3>📋 Сертификаты по направлениям (всего)</h3>
          <div className="erp-sections">{Object.keys(certBySrc).length === 0 ? <p className="erp-muted">Нет данных.</p> : Object.entries(certBySrc).sort((a, b) => b[1] - a[1]).map(([src, n]) => <div className="erp-sec-row" key={src}><span className="erp-sec-label">{src}</span><span className="erp-sec-val">{n}</span></div>)}</div>
        </Card>
      </div>
    </div>
  );
}
