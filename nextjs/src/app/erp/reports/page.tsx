'use client';
import { useApi } from '@/lib/api';
import { Card, PageTitle } from '@/components/ui';

type Op = { opType: string; amount: string | number; opDate?: string | null };
type Acct = { section?: string | null; balance?: string | number | null };
type Sale = { totalSum?: string | number; payStatus?: string | null };
type Debt = { type: string; amount: string | number; paidAmount: string | number; status: string };
type Cert = { source: string };

const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU') + ' ₸';
const SECTIONS = [{ k: 'poverka', l: '№1 Поверка' }, { k: 'sale', l: '№2 Продажа' }, { k: 'branch', l: '№3 Филиалы' }, { k: 'other', l: '№4 Прочие' }];

export default function ReportsPage() {
  const { data: fin } = useApi<{ accounts: Acct[]; operations: Op[] }>('/api/v2/finance');
  const { data: sales } = useApi<Sale[]>('/api/v2/sales');
  const { data: debts } = useApi<Debt[]>('/api/v2/debts');
  const { data: certs } = useApi<Cert[]>('/api/v2/certs?type=cert&archived=false');

  const accs = fin?.accounts || [], ops = fin?.operations || [];
  const cash = accs.reduce((s, a) => s + (Number(a.balance) || 0), 0);
  const m = new Date().toISOString().slice(0, 7);
  const inc = ops.filter(o => o.opType === 'Приход' && String(o.opDate || '').startsWith(m)).reduce((s, o) => s + (Number(o.amount) || 0), 0);
  const exp = ops.filter(o => o.opType !== 'Приход' && String(o.opDate || '').startsWith(m)).reduce((s, o) => s + (Number(o.amount) || 0), 0);
  const salesSum = (sales || []).reduce((s, x) => s + (Number(x.totalSum) || 0), 0);
  const salesPaid = (sales || []).filter(s => s.payStatus === 'Оплачено').reduce((s, x) => s + (Number(x.totalSum) || 0), 0);
  const recv = (debts || []).filter(d => d.type === 'debit' && d.status !== 'closed').reduce((s, d) => s + Math.max(0, (Number(d.amount) || 0) - (Number(d.paidAmount) || 0)), 0);
  const payable = (debts || []).filter(d => d.type === 'credit' && d.status !== 'closed').reduce((s, d) => s + Math.max(0, (Number(d.amount) || 0) - (Number(d.paidAmount) || 0)), 0);
  const certBySrc: Record<string, number> = {};
  (certs || []).forEach(c => { certBySrc[c.source] = (certBySrc[c.source] || 0) + 1; });

  const Kpi = ({ i, l, v, c }: { i: string; l: string; v: string; c?: string }) => <div className="erp-kpi"><div className="erp-kpi-top"><span className="erp-kpi-ico">{i}</span><span className="erp-kpi-label">{l}</span></div><div className="erp-kpi-val" style={c ? { color: c } : undefined}>{v}</div></div>;

  return (
    <div>
      <PageTitle title="Отчёты" sub="Сводка по реальным данным" />
      <div className="erp-kpi-grid">
        <Kpi i="💳" l="Касса" v={fmt(cash)} />
        <Kpi i="📥" l="Приход (месяц)" v={fmt(inc)} c="#16a34a" />
        <Kpi i="📤" l="Расход (месяц)" v={fmt(exp)} c="#dc2626" />
        <Kpi i="💰" l="Продажи (оплачено/всего)" v={`${fmt(salesPaid)} / ${fmt(salesSum)}`} />
        <Kpi i="🧾" l="Дебиторка" v={fmt(recv)} />
        <Kpi i="💸" l="Кредиторка" v={fmt(payable)} c="#dc2626" />
      </div>
      <div className="erp-panels">
        <Card>
          <h3>💳 Баланс по разделам</h3>
          <div className="erp-sections">{SECTIONS.map(s => <div className="erp-sec-row" key={s.k}><span className="erp-sec-label">{s.l}</span><span className="erp-sec-val">{fmt(accs.filter(a => (a.section || 'other') === s.k).reduce((x, a) => x + (Number(a.balance) || 0), 0))}</span></div>)}</div>
        </Card>
        <Card>
          <h3>📋 Сертификаты по направлениям</h3>
          <div className="erp-sections">{Object.keys(certBySrc).length === 0 ? <p className="erp-muted">Нет данных.</p> : Object.entries(certBySrc).sort((a, b) => b[1] - a[1]).map(([src, n]) => <div className="erp-sec-row" key={src}><span className="erp-sec-label">{src}</span><span className="erp-sec-val">{n}</span></div>)}</div>
        </Card>
      </div>
    </div>
  );
}
