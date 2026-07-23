'use client';
import * as React from 'react';
import Link from 'next/link';
import { useApi } from '@/lib/api';
import { Card, PageTitle, Badge } from '@/components/ui';

type Acct = { id: string; name: string; section?: string | null; balance?: string | number | null; icon?: string | null };
type Op = { id: string; opType: string; amount: string | number; opDate?: string | null; name?: string | null; accountName?: string | null; source?: string | null };
type Debt = { type: string; amount: string | number; paidAmount: string | number; status: string; dueDate?: string | null };
type Task = { id: string; title: string; status?: string | null; completedAt?: string | null; assigneeName?: string | null; dueDate?: string | null };
type Order = { status?: string | null };
type Cert = { id: string; source?: string | null; docType?: string | null; operStatus?: string | null; payStatus?: string | null; fio?: string | null; meterType?: string | null; serialNo?: string | null; createdAt?: string | null };
type Product = { id: string; skuCode: string; name: string; minStock: number; currentStock: number; reserved?: number | null };
type Sale = { id: string; saleNo?: string | null; clientName?: string | null; productName?: string | null; qty?: number; totalSum?: string | number; payStatus?: string | null; cancelledAt?: string | null };

const num = (v: unknown) => Number(v) || 0;
const money = (n: number | string) => Math.round(num(n)).toLocaleString('ru-RU') + ' ₸';
const dmy = (d?: string | null) => (d ? String(d).slice(0, 10).split('-').reverse().join('.') : '');
const thisMonth = () => new Date().toISOString().slice(0, 7);
const todayStr = () => new Date().toISOString().slice(0, 10);
const SECTIONS = [{ key: 'poverka', label: '№1 Поверка', color: '#2563eb' }, { key: 'sale', label: '№2 Продажа', color: '#d97706' }, { key: 'branch', label: '№3 Филиалы', color: '#0d9488' }, { key: 'other', label: '№4 Прочие', color: '#6f42c1' }];
const OPER = ['В работе', 'Готова к КТРМ', 'Внести в КТРМ', 'КТРМ 70%', 'Внесён в КТРМ'];
const OPER_COLOR: Record<string, string> = { 'В работе': '#64748b', 'Готова к КТРМ': '#0ea5e9', 'Внести в КТРМ': '#d97706', 'КТРМ 70%': '#8b5cf6', 'Внесён в КТРМ': '#16a34a' };
const SRC = ['САМИ', 'ВДК', 'ТЭЦ', 'Выездная', 'Первичная-КМ', 'Первичная-АК', 'Астана'];
const SRC_COLOR: Record<string, string> = { 'САМИ': '#2563eb', 'ВДК': '#0891b2', 'ТЭЦ': '#7c3aed' };

function Kpi({ icon, label, value, sub, tone, href }: { icon: string; label: string; value: string; sub?: string; tone?: string; href?: string }) {
  const inner = (
    <div className="erp-kpi" style={href ? { cursor: 'pointer' } : undefined}>
      <div className="erp-kpi-top"><span className="erp-kpi-ico">{icon}</span><span className="erp-kpi-label">{label}</span></div>
      <div className="erp-kpi-val" style={tone ? { color: tone } : undefined}>{value}</div>
      {sub && <div className="erp-kpi-sub">{sub}</div>}
    </div>
  );
  return href ? <Link href={href} style={{ textDecoration: 'none', color: 'inherit' }}>{inner}</Link> : inner;
}

export default function Dashboard() {
  const fin = useApi<{ accounts: Acct[]; operations: Op[] }>('/api/v2/finance');
  const debts = useApi<Debt[]>('/api/v2/debts');
  const tasks = useApi<Task[]>('/api/v2/tasks');
  const ordF = useApi<Order[]>('/api/v2/orders?source=field_check');
  const ordT = useApi<Order[]>('/api/v2/orders?source=tec');
  const certs = useApi<Cert[]>('/api/v2/certs');
  const products = useApi<Product[]>('/api/v2/products');
  const sales = useApi<Sale[]>('/api/v2/sales');

  const accounts = fin.data?.accounts || [];
  const ops = fin.data?.operations || [];
  const m = thisMonth(); const today = todayStr();
  const cash = accounts.reduce((s, a) => s + num(a.balance), 0);
  const income = ops.filter(o => o.opType === 'Приход' && String(o.opDate || '').startsWith(m)).reduce((s, o) => s + num(o.amount), 0);
  const expense = ops.filter(o => o.opType !== 'Приход' && String(o.opDate || '').startsWith(m)).reduce((s, o) => s + num(o.amount), 0);
  const bySection = SECTIONS.map(s => ({ ...s, total: accounts.filter(a => (a.section || 'other') === s.key).reduce((x, a) => x + num(a.balance), 0) }));
  const recentOps = ops.slice(0, 6);

  const debtList = debts.data || [];
  const receivable = debtList.filter(d => d.type === 'debit' && d.status !== 'closed').reduce((s, d) => s + Math.max(0, num(d.amount) - num(d.paidAmount)), 0);
  const payable = debtList.filter(d => d.type === 'credit' && d.status !== 'closed').reduce((s, d) => s + Math.max(0, num(d.amount) - num(d.paidAmount)), 0);
  const payableOverdue = debtList.some(d => d.type === 'credit' && d.status !== 'closed' && d.dueDate && String(d.dueDate).slice(0, 10) < today);

  const taskList = tasks.data || [];
  const openTasks = taskList.filter(t => t.status !== 'done' && !t.completedAt);
  const overdueTasks = openTasks.filter(t => t.dueDate && String(t.dueDate).slice(0, 10) < today);
  const ordersInWork = [...(ordF.data || []), ...(ordT.data || [])].filter(o => o.status === 'В работе').length;

  // ── поверка ──
  const poverki = (certs.data || []).filter(c => (c.docType || 'cert') === 'cert');
  const byOper = (k: string) => poverki.filter(c => c.operStatus === k).length;
  const totalCerts = poverki.length;
  const ktrmDone = byOper('Внесён в КТРМ');
  const inQueue = byOper('Внести в КТРМ') + byOper('КТРМ 70%');
  const unpaidCerts = poverki.filter(c => c.payStatus === 'В ожидании').length;
  const ktrmPct = totalCerts ? Math.round((ktrmDone / totalCerts) * 100) : 0;
  const pipeline = OPER.map(k => ({ k, n: byOper(k) })).filter(x => x.n > 0);
  const bySrc = SRC.map(s => ({ s, n: poverki.filter(c => c.source === s).length })).filter(x => x.n > 0);
  const srcMax = Math.max(1, ...bySrc.map(x => x.n));
  const recentCerts = poverki.slice(0, 5);

  // ── склад ──
  const prodList = products.data || [];
  const freeOf = (p: Product) => num(p.currentStock) - num(p.reserved);
  const low = prodList.filter(p => freeOf(p) < num(p.minStock) && freeOf(p) > 0);
  const empty = prodList.filter(p => freeOf(p) <= 0);
  const okNorm = prodList.length - low.length - empty.length;
  const critical = [...prodList].filter(p => freeOf(p) < num(p.minStock)).sort((a, b) => freeOf(a) - freeOf(b)).slice(0, 5);

  const saleList = (sales.data || []).filter(s => !s.cancelledAt);
  const recentSales = saleList.slice(0, 5);

  // ── расходы месяца по источникам ──
  const expBy: Record<string, number> = {};
  ops.filter(o => o.opType !== 'Приход' && String(o.opDate || '').startsWith(m)).forEach(o => { const k = o.source || 'Прочее'; expBy[k] = (expBy[k] || 0) + num(o.amount); });
  const expTop = Object.entries(expBy).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const expMax = Math.max(1, ...expTop.map(x => x[1]));

  // ── алерты ──
  const alerts: Array<{ ico: string; tone: string; text: string; href: string }> = [];
  if (overdueTasks.length) alerts.push({ ico: '⏰', tone: '#dc2626', text: `${overdueTasks.length} просроченных задач`, href: '/erp/tasks' });
  if (inQueue) alerts.push({ ico: '🤖', tone: '#b45309', text: `${inQueue} записей ждут робота КТРМ`, href: '/erp/certs' });
  if (unpaidCerts) alerts.push({ ico: '💳', tone: '#1d4ed8', text: `${unpaidCerts} поверок ожидают оплаты`, href: '/erp/certs' });
  if (empty.length) alerts.push({ ico: '📦', tone: '#dc2626', text: `${empty.length} позиций нет на складе`, href: '/erp/warehouse' });
  if (low.length) alerts.push({ ico: '⚠️', tone: '#b45309', text: `${low.length} позиций ниже минимума`, href: '/erp/warehouse' });

  return (
    <div>
      <PageTitle title="Рабочий стол" sub="Оперативная сводка по реальным данным · нажмите на карточку, чтобы перейти" />

      <div className="erp-kpi-grid">
        <Kpi icon="📤" label="Кредиторка (мы должны)" value={debts.error ? '—' : money(payable)} sub={payableOverdue ? '⚠ есть просрочка' : 'остаток'} tone={payableOverdue ? '#dc2626' : undefined} href="/erp/debts" />
        <Kpi icon="📋" label="Поверок всего" value={certs.error ? '—' : String(totalCerts)} sub={`${ktrmPct}% внесено в КТРМ`} href="/erp/certs" />
        <Kpi icon="✅" label="Внесено в КТРМ" value={certs.error ? '—' : String(ktrmDone)} tone="#16a34a" sub={`из ${totalCerts}`} href="/erp/certs" />
        <Kpi icon="🤖" label="В очереди КТРМ" value={certs.error ? '—' : String(inQueue)} tone="#b45309" sub={inQueue ? 'ждут робота' : 'очередь пуста ✓'} href="/erp/certs" />
        <Kpi icon="⏳" label="Ожидают оплаты" value={certs.error ? '—' : String(unpaidCerts)} tone={unpaidCerts ? '#dc2626' : undefined} href="/erp/certs" />
        <Kpi icon="🏭" label="Позиций в норме" value={products.error ? '—' : String(okNorm)} sub={`⚠ ${low.length} мало · 🚫 ${empty.length} нет`} href="/erp/warehouse" />
        <Kpi icon="💳" label="Касса (все счета)" value={fin.error ? '—' : money(cash)} sub={`${accounts.length} счетов`} href="/erp/finance" />
        <Kpi icon="📥" label="Доходы (месяц)" value={fin.error ? '—' : money(income)} tone="#16a34a" href="/erp/finance" />
        <Kpi icon="📤" label="Расходы (месяц)" value={fin.error ? '—' : money(expense)} tone="#dc2626" href="/erp/expenses" />
        <Kpi icon="🧾" label="Дебиторка" value={debts.error ? '—' : money(receivable)} sub="нам должны" href="/erp/debts" />
        <Kpi icon="✅" label="Открытые задачи" value={tasks.error ? '—' : String(openTasks.length)} sub={overdueTasks.length ? `${overdueTasks.length} просрочено` : `всего ${taskList.length}`} tone={overdueTasks.length ? '#dc2626' : undefined} href="/erp/tasks" />
        <Kpi icon="📥" label="Заявки в работе" value={(ordF.error && ordT.error) ? '—' : String(ordersInWork)} href="/erp/orders" />
      </div>

      <div className="erp-panels">
        <Card>
          <h3>🚨 Требуют внимания {alerts.length > 0 && <span style={{ color: '#dc2626' }}>· {alerts.length}</span>}</h3>
          {alerts.length === 0 ? <p className="erp-muted">✅ Всё в порядке — срочных задач нет.</p> : (
            <div className="erp-list">
              {alerts.map((a, i) => (
                <Link key={i} href={a.href} className="erp-list-row" style={{ textDecoration: 'none', color: 'inherit', cursor: 'pointer' }}>
                  <span className="erp-list-ico">{a.ico}</span>
                  <span className="erp-list-main"><span style={{ color: a.tone, fontWeight: 600 }}>{a.text}</span><span className="erp-list-sub">перейти →</span></span>
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <h3>🔄 Статусы поверок</h3>
          {certs.error ? <p className="erp-muted">Нет доступа к поверке.</p> : totalCerts === 0 ? <p className="erp-muted">Поверок пока нет.</p> : (
            <>
              <div className="erp-chips" style={{ marginBottom: 12 }}>
                {pipeline.map(p => <Link key={p.k} href="/erp/certs" className="erp-chip" style={{ textDecoration: 'none', borderColor: OPER_COLOR[p.k], color: OPER_COLOR[p.k] }}>{p.k} · {p.n}</Link>)}
              </div>
              {bySrc.map(x => (
                <div key={x.s} style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0', fontSize: 12 }}>
                  <span style={{ width: 44, color: '#64748b' }}>{x.s}</span>
                  <span style={{ flex: 1, background: '#f1f5f9', borderRadius: 4, height: 10, overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${(x.n / srcMax) * 100}%`, background: SRC_COLOR[x.s] || '#94a3b8' }} /></span>
                  <span style={{ width: 24, textAlign: 'right', fontWeight: 600 }}>{x.n}</span>
                </div>
              ))}
            </>
          )}
        </Card>

        <Card>
          <h3>🏭 Склад — остатки</h3>
          {products.error ? <p className="erp-muted">Нет доступа к складу.</p> : (
            <>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <div style={{ flex: 1, textAlign: 'center', background: '#e3f5ea', borderRadius: 8, padding: '6px 4px' }}><div style={{ fontWeight: 800, color: '#16a34a' }}>{okNorm}</div><div style={{ fontSize: 11, color: '#64748b' }}>Норма</div></div>
                <div style={{ flex: 1, textAlign: 'center', background: '#fbf1dd', borderRadius: 8, padding: '6px 4px' }}><div style={{ fontWeight: 800, color: '#b45309' }}>{low.length}</div><div style={{ fontSize: 11, color: '#64748b' }}>Мало</div></div>
                <div style={{ flex: 1, textAlign: 'center', background: '#fce8ea', borderRadius: 8, padding: '6px 4px' }}><div style={{ fontWeight: 800, color: '#dc2626' }}>{empty.length}</div><div style={{ fontSize: 11, color: '#64748b' }}>Нет</div></div>
              </div>
              {critical.length === 0 ? <p className="erp-muted" style={{ fontSize: 13 }}>✓ Все позиции в норме</p> : (
                <div className="erp-list">
                  {critical.map(p => (
                    <Link key={p.id} href="/erp/warehouse" className="erp-list-row" style={{ textDecoration: 'none', color: 'inherit' }}>
                      <span className="erp-list-ico">{freeOf(p) <= 0 ? '🚫' : '⚠️'}</span>
                      <span className="erp-list-main">{p.name}<span className="erp-list-sub">{p.skuCode} · мин {p.minStock}</span></span>
                      <span className="erp-list-val" style={{ color: freeOf(p) <= 0 ? '#dc2626' : '#b45309' }}>{freeOf(p)} шт.</span>
                    </Link>
                  ))}
                </div>
              )}
            </>
          )}
        </Card>
      </div>

      <div className="erp-panels">
        <Card>
          <h3>💳 Финансы по разделам <Link href="/erp/finance" style={{ float: 'right', fontSize: 12, fontWeight: 400 }}>Открыть →</Link></h3>
          {fin.error ? <p className="erp-muted">Нет доступа к финансам.</p> : (
            <div className="erp-sections">
              {bySection.map(s => <div className="erp-sec-row" key={s.key}><span className="erp-sec-dot" style={{ background: s.color }} /><span className="erp-sec-label">{s.label}</span><span className="erp-sec-val">{money(s.total)}</span></div>)}
              <div className="erp-sec-row erp-sec-total"><span /><span className="erp-sec-label">Итого касса</span><span className="erp-sec-val">{money(cash)}</span></div>
            </div>
          )}
        </Card>

        <Card>
          <h3>🧾 Последние операции</h3>
          {fin.error ? <p className="erp-muted">—</p> : recentOps.length === 0 ? <p className="erp-muted">Пока нет операций.</p> : (
            <div className="erp-list">
              {recentOps.map(o => (
                <div className="erp-list-row" key={o.id}>
                  <span className="erp-list-ico">{o.opType === 'Приход' ? '💚' : '🔴'}</span>
                  <span className="erp-list-main">{o.name || o.opType}<span className="erp-list-sub">{o.accountName || ''} · {dmy(o.opDate)}</span></span>
                  <span className="erp-list-val" style={{ color: o.opType === 'Приход' ? '#16a34a' : '#dc2626' }}>{o.opType === 'Приход' ? '+' : '−'}{money(o.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <h3>💸 Расходы за месяц <Link href="/erp/expenses" style={{ float: 'right', fontSize: 12, fontWeight: 400 }}>Аналитика →</Link></h3>
          {expTop.length === 0 ? <p className="erp-muted">Расходов за месяц нет.</p> : (
            <div>
              {expTop.map(([k, v]) => (
                <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '5px 0', fontSize: 12 }}>
                  <span style={{ width: 90, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k}</span>
                  <span style={{ flex: 1, background: '#f1f5f9', borderRadius: 4, height: 10 }}><span style={{ display: 'block', height: '100%', width: `${(v / expMax) * 100}%`, background: '#dc2626', borderRadius: 4 }} /></span>
                  <span style={{ width: 74, textAlign: 'right', fontWeight: 600 }}>{money(v)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="erp-panels">
        <Card>
          <h3>📋 Последние поверки <Link href="/erp/certs" style={{ float: 'right', fontSize: 12, fontWeight: 400 }}>Все →</Link></h3>
          {certs.error ? <p className="erp-muted">Нет доступа.</p> : recentCerts.length === 0 ? <p className="erp-muted">Нет поверок.</p> : (
            <div className="erp-list">
              {recentCerts.map(c => (
                <Link key={c.id} href="/erp/certs" className="erp-list-row" style={{ textDecoration: 'none', color: 'inherit' }}>
                  <span className="erp-list-ico">📋</span>
                  <span className="erp-list-main">{c.fio || '—'}<span className="erp-list-sub">{c.meterType || ''} {c.serialNo ? '№' + c.serialNo : ''} · {c.source}</span></span>
                  <Badge tone={c.operStatus === 'Внесён в КТРМ' ? 'ok' : c.operStatus === 'В работе' ? 'neutral' : 'warn'}>{c.operStatus}</Badge>
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <h3>💰 Последние продажи <Link href="/erp/sales" style={{ float: 'right', fontSize: 12, fontWeight: 400 }}>Все →</Link></h3>
          {sales.error ? <p className="erp-muted">Нет доступа.</p> : recentSales.length === 0 ? <p className="erp-muted">Нет продаж.</p> : (
            <div className="erp-list">
              {recentSales.map(s => (
                <Link key={s.id} href="/erp/sales" className="erp-list-row" style={{ textDecoration: 'none', color: 'inherit' }}>
                  <span className="erp-list-ico">💰</span>
                  <span className="erp-list-main">{s.clientName || '—'}<span className="erp-list-sub">{s.productName || ''} · {s.qty || 0} шт.</span></span>
                  <span className="erp-list-val" style={{ color: s.payStatus === 'Оплачено' ? '#16a34a' : '#b45309' }}>{money(s.totalSum || 0)}</span>
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <h3>✅ Открытые задачи <Link href="/erp/tasks" style={{ float: 'right', fontSize: 12, fontWeight: 400 }}>Все →</Link></h3>
          {tasks.error ? <p className="erp-muted">Нет доступа к задачам.</p> : openTasks.length === 0 ? <p className="erp-muted">Открытых задач нет 🎉</p> : (
            <div className="erp-list">
              {openTasks.slice(0, 6).map(t => {
                const od = t.dueDate && String(t.dueDate).slice(0, 10) < today;
                return (
                  <Link key={t.id} href="/erp/tasks" className="erp-list-row" style={{ textDecoration: 'none', color: 'inherit' }}>
                    <span className="erp-list-ico">{od ? '⏰' : '•'}</span>
                    <span className="erp-list-main">{t.title}<span className="erp-list-sub" style={od ? { color: '#dc2626' } : undefined}>{t.assigneeName || 'не назначен'}{t.dueDate ? ' · до ' + dmy(t.dueDate) : ''}</span></span>
                  </Link>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <p className="erp-muted" style={{ marginTop: 14, fontSize: 12 }}>Данные — из общего бэкенда. Пустые блоки означают, что у вашей роли нет доступа к разделу.</p>
    </div>
  );
}
