'use client';
import { useApi } from '@/lib/api';
import { Card, PageTitle } from '@/components/ui';

type Acct = { id: string; name: string; section?: string | null; balance?: string | number | null; icon?: string | null };
type Op = { id: string; opType: string; amount: string | number; opDate?: string | null; name?: string | null; accountName?: string | null };
type Debt = { type: string; amount: string | number; paidAmount: string | number; status: string };
type Task = { id: string; title: string; status?: string | null; completedAt?: string | null; assigneeName?: string | null; dueDate?: string | null };
type Order = { status?: string | null };

const money = (n: number | string) => Math.round(Number(n) || 0).toLocaleString('ru-RU') + ' ₸';
const thisMonth = () => new Date().toISOString().slice(0, 7);
const SECTIONS = [
  { key: 'poverka', label: '№1 Поверка', color: '#2563eb' },
  { key: 'sale', label: '№2 Продажа', color: '#d97706' },
  { key: 'branch', label: '№3 Филиалы', color: '#0d9488' },
  { key: 'other', label: '№4 Прочие', color: '#6f42c1' },
];

function Kpi({ icon, label, value, sub, tone }: { icon: string; label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="erp-kpi">
      <div className="erp-kpi-top"><span className="erp-kpi-ico">{icon}</span><span className="erp-kpi-label">{label}</span></div>
      <div className="erp-kpi-val" style={tone ? { color: tone } : undefined}>{value}</div>
      {sub && <div className="erp-kpi-sub">{sub}</div>}
    </div>
  );
}

export default function Dashboard() {
  const fin = useApi<{ accounts: Acct[]; operations: Op[] }>('/api/v2/finance');
  const debts = useApi<Debt[]>('/api/v2/debts');
  const tasks = useApi<Task[]>('/api/v2/tasks');
  const ordF = useApi<Order[]>('/api/v2/orders?source=field_check');
  const ordT = useApi<Order[]>('/api/v2/orders?source=tec');

  const accounts = fin.data?.accounts || [];
  const ops = fin.data?.operations || [];
  const m = thisMonth();
  const cash = accounts.reduce((s, a) => s + (Number(a.balance) || 0), 0);
  const income = ops.filter(o => o.opType === 'Приход' && String(o.opDate || '').startsWith(m)).reduce((s, o) => s + (Number(o.amount) || 0), 0);
  const expense = ops.filter(o => o.opType !== 'Приход' && String(o.opDate || '').startsWith(m)).reduce((s, o) => s + (Number(o.amount) || 0), 0);

  const debtList = debts.data || [];
  const receivable = debtList.filter(d => d.type === 'debit' && d.status !== 'closed').reduce((s, d) => s + Math.max(0, (Number(d.amount) || 0) - (Number(d.paidAmount) || 0)), 0);

  const taskList = tasks.data || [];
  const openTasks = taskList.filter(t => !t.completedAt && t.status !== 'Готова');
  const ordersInWork = [...(ordF.data || []), ...(ordT.data || [])].filter(o => o.status === 'В работе').length;

  const bySection = SECTIONS.map(s => ({ ...s, total: accounts.filter(a => (a.section || 'other') === s.key).reduce((x, a) => x + (Number(a.balance) || 0), 0) }));
  const recentOps = [...ops].slice(0, 6);
  const finErr = fin.error;

  return (
    <div>
      <PageTitle title="Рабочий стол" sub="Ключевые показатели по реальным данным" />

      <div className="erp-kpi-grid">
        <Kpi icon="💳" label="Касса (все счета)" value={finErr ? '—' : money(cash)} sub={`${accounts.length} счетов`} />
        <Kpi icon="📥" label="Доходы (месяц)" value={finErr ? '—' : money(income)} tone="#16a34a" />
        <Kpi icon="📤" label="Расходы (месяц)" value={finErr ? '—' : money(expense)} tone="#dc2626" />
        <Kpi icon="🧾" label="Дебиторка" value={debts.error ? '—' : money(receivable)} sub="нам должны" />
        <Kpi icon="✅" label="Открытые задачи" value={tasks.error ? '—' : String(openTasks.length)} sub={`всего ${taskList.length}`} />
        <Kpi icon="📋" label="Заявки в работе" value={(ordF.error && ordT.error) ? '—' : String(ordersInWork)} />
      </div>

      <div className="erp-panels">
        <Card>
          <h3>💳 Финансы по разделам</h3>
          {finErr ? <p className="erp-muted">Нет доступа к финансам.</p> : (
            <div className="erp-sections">
              {bySection.map(s => (
                <div className="erp-sec-row" key={s.key}>
                  <span className="erp-sec-dot" style={{ background: s.color }} />
                  <span className="erp-sec-label">{s.label}</span>
                  <span className="erp-sec-val">{money(s.total)}</span>
                </div>
              ))}
              <div className="erp-sec-row erp-sec-total"><span /><span className="erp-sec-label">Итого касса</span><span className="erp-sec-val">{money(cash)}</span></div>
            </div>
          )}
        </Card>

        <Card>
          <h3>🧾 Последние операции</h3>
          {finErr ? <p className="erp-muted">—</p> : recentOps.length === 0 ? <p className="erp-muted">Пока нет операций.</p> : (
            <div className="erp-list">
              {recentOps.map(o => (
                <div className="erp-list-row" key={o.id}>
                  <span className="erp-list-ico">{o.opType === 'Приход' ? '💚' : '🔴'}</span>
                  <span className="erp-list-main">{o.name || o.opType}<span className="erp-list-sub">{o.accountName || ''} · {String(o.opDate || '').slice(0, 10).split('-').reverse().join('.')}</span></span>
                  <span className="erp-list-val" style={{ color: o.opType === 'Приход' ? '#16a34a' : '#dc2626' }}>{o.opType === 'Приход' ? '+' : '−'}{money(o.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <h3>✅ Открытые задачи</h3>
          {tasks.error ? <p className="erp-muted">Нет доступа к задачам.</p> : openTasks.length === 0 ? <p className="erp-muted">Открытых задач нет 🎉</p> : (
            <div className="erp-list">
              {openTasks.slice(0, 6).map(t => (
                <div className="erp-list-row" key={t.id}>
                  <span className="erp-list-ico">•</span>
                  <span className="erp-list-main">{t.title}<span className="erp-list-sub">{t.assigneeName || 'не назначен'}{t.dueDate ? ' · до ' + String(t.dueDate).slice(0, 10).split('-').reverse().join('.') : ''}</span></span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <p className="erp-muted" style={{ marginTop: 14, fontSize: 12 }}>
        Данные — из общего бэкенда, что и старый ERP. Пустые блоки означают, что у вашей роли нет доступа к разделу.
      </p>
    </div>
  );
}
