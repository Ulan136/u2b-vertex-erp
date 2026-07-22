'use client';
import * as React from 'react';
import { useApi, apiSend } from '@/lib/api';
import { toast } from '@/lib/toast';
import { Card, Badge, Button, PageTitle, Modal, Field, Input, Select, EmptyRow } from '@/components/ui';

type Op = { id: string; opType: string; amount: string | number; opDate?: string | null; name?: string | null; accountName?: string | null; accountId: string; source?: string | null; comment?: string | null; expenseCat?: string | null; subCategory?: string | null; supplier?: string | null; docNo?: string | null; status?: string | null; orderId?: string | null };
type Acct = { id: string; name: string; icon?: string | null; section?: string | null; sortOrder?: number | null };
type Cat = { id: string; name: string; icon?: string | null; base?: boolean; subs?: { id: string; name: string }[] };
type Emp = { userId: string; name: string; salaryHidden?: boolean };
type Order = { id: string; orderNo?: string | null; clientName?: string | null };

const SECTIONS = [{ key: 'poverka', no: 1, label: 'Поверка' }, { key: 'sale', no: 2, label: 'Продажа' }, { key: 'branch', no: 3, label: 'Филиалы' }, { key: 'other', no: 4, label: 'Прочие операции' }];
const STATUSES = ['Оплачен', 'Ожидает', 'Отменён'];
const num = (v: unknown) => Number(v) || 0;
const fmt = (n: number | string) => (Number(n) || 0).toLocaleString('ru-RU') + ' ₸';
const dmy = (d?: string | null) => (d ? String(d).slice(0, 10).split('-').reverse().join('.') : '—');
const today = () => new Date().toISOString().slice(0, 10);

export default function ExpensesPage() {
  const { data: fin, error, isLoading, mutate } = useApi<{ accounts: Acct[]; operations: Op[] }>('/api/v2/finance');
  const { data: cats, mutate: mutateCats } = useApi<Cat[]>('/api/v2/expense-categories');
  const { data: emp } = useApi<{ employees: Emp[] }>('/api/v2/employees');
  const { data: orders } = useApi<Order[]>('/api/v2/orders');
  const { data: session } = useApi<{ user?: { name?: string } }>('/api/auth/session');
  const respName = session?.user?.name || '—';

  const accounts = fin?.accounts || [];
  const catList = cats || [];
  const expenses = React.useMemo(() => (fin?.operations || []).filter(o => o.opType === 'Расход' && !o.name?.startsWith('Сторно')), [fin]);
  const orderNo = (id?: string | null) => orders?.find(o => o.id === id)?.orderNo;

  // категория/подкатегория операции: из полей, иначе из имени/источника (legacy).
  const catOf = (o: Op) => o.expenseCat || (o.source === 'Зарплата' ? 'Зарплата' : (o.name || '').split(':')[0].trim() || 'Прочие');
  const subOf = (o: Op) => o.subCategory || '';
  const statusOf = (o: Op) => o.status || 'Оплачен';
  const accName = (o: Op) => o.accountName || accounts.find(a => a.id === o.accountId)?.name || '—';

  // ── фильтры ──
  const [q, setQ] = React.useState('');
  const [fAcc, setFAcc] = React.useState('');
  const [fStatus, setFStatus] = React.useState('');
  const [pick, setPick] = React.useState<{ cat: string; sub: string }>({ cat: '', sub: '' });

  const list = expenses.filter(o => {
    if (q.trim() && !`${o.name || ''} ${o.supplier || ''} ${o.comment || ''}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (fAcc && accName(o) !== fAcc) return false;
    if (fStatus && statusOf(o) !== fStatus) return false;
    if (pick.cat && catOf(o) !== pick.cat) return false;
    if (pick.sub && subOf(o) !== pick.sub) return false;
    return true;
  });
  const listSum = list.reduce((s, o) => s + num(o.amount), 0);

  // ── модалка расхода ──
  const [modal, setModal] = React.useState(false);
  const [catModal, setCatModal] = React.useState(false);
  const [newCat, setNewCat] = React.useState('');
  const [ordQ, setOrdQ] = React.useState('');
  const emptyF = () => ({ editId: '', catId: catList[0]?.id || '', subName: '', section: 'other', accountId: '', amount: '', desc: '', supplier: '', docNo: '', status: 'Оплачен', orderId: '', comment: '', employeeId: '', date: today(), err: '', saving: false });
  const [f, setF] = React.useState(emptyF());
  const cat = catList.find(c => c.id === f.catId);
  const isSalary = cat?.name === 'Зарплата';
  const secAccounts = accounts.filter(a => (a.section || 'other') === f.section).sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0));

  function open() { setF(emptyF()); setModal(true); }
  function openEdit(o: Op) {
    const c = catList.find(x => x.name === catOf(o));
    setF({ editId: o.id, catId: c?.id || catList[0]?.id || '', subName: subOf(o), section: accounts.find(a => a.id === o.accountId)?.section || 'other', accountId: o.accountId, amount: String(num(o.amount)), desc: (o.name || '').replace(/^[^:]*:\s*/, ''), supplier: o.supplier || '', docNo: o.docNo || '', status: statusOf(o), orderId: o.orderId || '', comment: o.comment || '', employeeId: '', date: (o.opDate || '').slice(0, 10) || today(), err: '', saving: false });
    setModal(true);
  }

  async function save() {
    const amount = Number(f.amount) || 0;
    if (!f.editId && amount <= 0) { setF(s => ({ ...s, err: 'Сумма больше 0' })); return; }
    if (!f.editId && !isSalary && !f.accountId) { setF(s => ({ ...s, err: 'Выберите счёт оплаты' })); return; }
    if (!f.editId && isSalary && (!f.accountId || !f.employeeId)) { setF(s => ({ ...s, err: 'Выберите сотрудника и счёт' })); return; }
    setF(s => ({ ...s, saving: true, err: '' }));
    const name = (f.desc || cat?.name || 'Расход');
    try {
      if (f.editId) {
        // правка метаданных (сумма/счёт не меняем — балансы защищены)
        await apiSend(`/api/v2/finance/${f.editId}`, 'PATCH', { name, opDate: f.date, comment: f.comment || null, expenseCat: cat?.name || null, subCategory: f.subName || null, supplier: f.supplier || null, docNo: f.docNo || null, status: f.status, orderId: f.orderId || null });
      } else if (isSalary) {
        const url = `/api/v2/employees/${f.employeeId}/payments`;
        const body: Record<string, unknown> = { amount, accountId: f.accountId, kind: 'salary', comment: f.desc || null, confirmOverpay: false };
        let r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (r.status === 409) { const e = await r.json().catch(() => ({})); if (!confirm((e.error || 'Оклад выплачен.') + '\n\nПровести как аванс?')) { setF(s => ({ ...s, saving: false })); return; } body.confirmOverpay = true; r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
        if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || ('HTTP ' + r.status)); }
      } else {
        await apiSend('/api/v2/finance', 'POST', { opType: 'Расход', accountId: f.accountId, amount, name, source: 'Расходы', opDate: f.date, comment: f.comment || null, expenseCat: cat?.name || null, subCategory: f.subName || null, supplier: f.supplier || null, docNo: f.docNo || null, status: f.status, orderId: f.orderId || null });
      }
      setModal(false); await mutate(); toast(f.editId ? '✅ Расход обновлён' : '✅ Расход проведён');
    } catch (e) { setF(s => ({ ...s, err: (e as Error).message, saving: false })); }
  }
  async function del(o: Op) {
    if (!confirm(`Удалить расход «${o.name}»?\nБудет сторно — сумма вернётся на счёт.`)) return;
    try { await apiSend(`/api/v2/finance/${o.id}/reverse`, 'POST'); await mutate(); toast('↩️ Расход сторнирован'); }
    catch (e) { toast('⚠️ ' + (e as Error).message); }
  }
  async function addCat() { if (!newCat.trim()) return; try { await apiSend('/api/v2/expense-categories', 'POST', { name: newCat.trim() }); setNewCat(''); await mutateCats(); toast('✅ Категория добавлена'); } catch (e) { toast('⚠️ ' + (e as Error).message); } }
  async function delCat(c: Cat) { if (c.base) { toast('⚠️ Базовую нельзя'); return; } if (!confirm(`Удалить категорию «${c.name}»?`)) return; try { await apiSend(`/api/v2/expense-categories/${c.id}`, 'DELETE'); await mutateCats(); toast('🗑️ Удалено'); } catch (e) { toast('⚠️ ' + (e as Error).message); } }

  const ordHits = (orders || []).filter(o => !ordQ.trim() || (o.orderNo || '').toLowerCase().includes(ordQ.toLowerCase())).slice(0, 20);

  return (
    <div>
      <PageTitle title="Расходы" sub="Журнал расходов — реальные операции из Финансов" action={<div style={{ display: 'flex', gap: 8 }}><Button variant="outline" onClick={() => setCatModal(true)}>Категории</Button><Button onClick={open}>+ Расход</Button></div>} />

      <div className="rsh-split">
        {/* Левое дерево категорий */}
        <Card className="rsh-tree">
          <div className="rsh-tree-head"><span>Категории</span><button className="erp-icon-btn" title="Категории" onClick={() => setCatModal(true)}>＋</button></div>
          <div className={`rsh-tree-item${!pick.cat ? ' on' : ''}`} onClick={() => setPick({ cat: '', sub: '' })}>📋 Все расходы <span className="erp-muted">{expenses.length}</span></div>
          {catList.map(c => {
            const n = expenses.filter(o => catOf(o) === c.name).length;
            return (
              <div key={c.id}>
                <div className={`rsh-tree-item${pick.cat === c.name && !pick.sub ? ' on' : ''}`} onClick={() => setPick({ cat: pick.cat === c.name && !pick.sub ? '' : c.name, sub: '' })}>{c.icon || '📁'} {c.name} <span className="erp-muted">{n}</span></div>
                {pick.cat === c.name && (c.subs || []).map(s => (
                  <div key={s.id} className={`rsh-tree-sub${pick.sub === s.name ? ' on' : ''}`} onClick={() => setPick({ cat: c.name, sub: pick.sub === s.name ? '' : s.name })}>└ {s.name}</div>
                ))}
              </div>
            );
          })}
        </Card>

        {/* Правая часть */}
        <div className="rsh-main">
          <Card className="erp-filters" style={{ flexWrap: 'wrap', gap: 8 }}>
            <Input placeholder="🔍 Описание, поставщик…" value={q} onChange={e => setQ(e.target.value)} style={{ maxWidth: 200 }} />
            <Select value={fAcc} onChange={e => setFAcc(e.target.value)}><option value="">Счёт: все</option>{Array.from(new Set(accounts.map(a => a.name))).map(n => <option key={n}>{n}</option>)}</Select>
            <Select value={fStatus} onChange={e => setFStatus(e.target.value)}><option value="">Статус: все</option>{STATUSES.map(s => <option key={s}>{s}</option>)}</Select>
            <span style={{ marginLeft: 'auto', fontSize: 12 }} className="erp-muted">Записей: <b>{list.length}</b> · <b style={{ color: '#dc2626' }}>{fmt(listSum)}</b></span>
          </Card>

          <Card style={{ marginTop: 8, padding: 0, overflowX: 'auto' }}>
            {error ? <EmptyRow>Нет доступа к финансам.</EmptyRow> : isLoading ? <EmptyRow>Загрузка…</EmptyRow>
              : list.length === 0 ? <EmptyRow>Расходов нет. Нажмите «+ Расход».</EmptyRow>
              : (
                <table className="erp-table" style={{ fontSize: 12 }}>
                  <thead><tr>
                    <th>№</th><th>Дата</th><th>Категория</th><th>Подкатегория</th><th>Описание</th><th>Поставщик</th>
                    <th style={{ textAlign: 'right' }}>Сумма</th><th>🧾 Счёт</th><th>Привязка</th><th>Статус</th><th style={{ textAlign: 'center' }}>Действия</th>
                  </tr></thead>
                  <tbody>
                    {list.map((o, i) => {
                      const salary = o.source === 'Зарплата';
                      const st = statusOf(o);
                      return (
                        <tr key={o.id}>
                          <td className="erp-muted">{i + 1}</td>
                          <td className="erp-muted">{dmy(o.opDate)}</td>
                          <td>{salary ? '👤 ' : ''}{catOf(o)}</td>
                          <td className="erp-muted">{subOf(o) || '—'}</td>
                          <td className="erp-td-main">{o.name}</td>
                          <td>{o.supplier || '—'}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: '#dc2626' }}>−{fmt(o.amount)}</td>
                          <td>{accName(o)}</td>
                          <td className="erp-muted">{orderNo(o.orderId) || '—'}</td>
                          <td><Badge tone={st === 'Оплачен' ? 'ok' : st === 'Отменён' ? 'err' : 'warn'}>{st}</Badge></td>
                          <td style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>
                            {!salary && <button className="erp-icon-btn" title="Изменить" onClick={() => openEdit(o)}>✏️</button>}
                            {!salary && <button className="erp-icon-btn" title="Удалить (сторно)" style={{ color: '#dc2626' }} onClick={() => del(o)}>🗑️</button>}
                            {salary && <span className="erp-muted" style={{ fontSize: 11 }}>кадры</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
          </Card>
        </div>
      </div>

      {/* Модалка расхода */}
      <Modal open={modal} onClose={() => setModal(false)} title={f.editId ? '✏️ Расход' : '💸 Добавить расход'} width={620}
        footer={<><Button onClick={save} disabled={f.saving}>{f.saving ? '…' : (f.editId ? 'Сохранить' : 'Провести')}</Button><Button variant="outline" onClick={() => setModal(false)}>Отмена</Button></>}>
        {f.err && <div className="erp-form-err">{f.err}</div>}

        <div className="cert-sec-lbl">📁 Категоризация</div>
        <div className="erp-form-row">
          <Field label="Категория" required><Select value={f.catId} onChange={e => setF({ ...f, catId: e.target.value, subName: '' })}>{catList.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}</Select></Field>
          <Field label="Подкатегория"><Select value={f.subName} onChange={e => setF({ ...f, subName: e.target.value })}><option value="">— выберите —</option>{(cat?.subs || []).map(s => <option key={s.id} value={s.name}>{s.name}</option>)}</Select></Field>
        </div>

        <div className="cert-sec-lbl">📋 Детали</div>
        <div className="erp-form-row">
          <Field label="Дата" required><Input type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></Field>
          <Field label="Сумма (₸)" required><Input type="number" value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} disabled={!!f.editId} /></Field>
        </div>
        <Field label="Описание"><Input value={f.desc} onChange={e => setF({ ...f, desc: e.target.value })} placeholder="Необязательно — по умолчанию название категории" /></Field>
        {isSalary && !f.editId
          ? <Field label="Сотрудник (получатель)" required><Select value={f.employeeId} onChange={e => setF({ ...f, employeeId: e.target.value })}><option value="">— выберите —</option>{(emp?.employees || []).filter(e => !e.salaryHidden).map(e => <option key={e.userId} value={e.userId}>{e.name}</option>)}</Select></Field>
          : <Field label="Поставщик / Получатель"><Input value={f.supplier} onChange={e => setF({ ...f, supplier: e.target.value })} placeholder="Название или ФИО" /></Field>}
        <Field label="Статус"><Select value={f.status} onChange={e => setF({ ...f, status: e.target.value })}>{STATUSES.map(s => <option key={s}>{s}</option>)}</Select></Field>

        <div className="cert-sec-lbl">🧾 Привязка</div>
        {isSalary ? (
          <Field label="Счёт списания" required><Select value={f.accountId} onChange={e => setF({ ...f, accountId: e.target.value })} disabled={!!f.editId}><option value="">— выберите счёт —</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}</Select></Field>
        ) : (
          <div className="erp-form-row">
            <Field label="Раздел"><Select value={f.section} onChange={e => setF({ ...f, section: e.target.value, accountId: '' })} disabled={!!f.editId}>{SECTIONS.map(s => <option key={s.key} value={s.key}>№{s.no} {s.label}</option>)}</Select></Field>
            <Field label="Счёт оплаты" required><Select value={f.accountId} onChange={e => setF({ ...f, accountId: e.target.value })} disabled={!!f.editId}><option value="">— выберите —</option>{secAccounts.map((a, i) => <option key={a.id} value={a.id}>№{i + 1} {a.icon} {a.name}</option>)}</Select></Field>
          </div>
        )}
        <div className="erp-form-row">
          <Field label="Привязать к заказу">
            <Input placeholder="🔍 Поиск по номеру" value={ordQ} onChange={e => setOrdQ(e.target.value)} style={{ marginBottom: 5 }} />
            <Select value={f.orderId} onChange={e => setF({ ...f, orderId: e.target.value })}><option value="">— не привязан —</option>{ordHits.map(o => <option key={o.id} value={o.id}>{o.orderNo} · {o.clientName || ''}</option>)}</Select>
          </Field>
          <Field label="№ документа"><Input value={f.docNo} onChange={e => setF({ ...f, docNo: e.target.value })} placeholder="СЧ-2026-001" /></Field>
        </div>
        <Field label="Комментарий"><Input value={f.comment} onChange={e => setF({ ...f, comment: e.target.value })} placeholder="Доп. информация…" /></Field>
        <div className="erp-muted" style={{ fontSize: 11, marginTop: 6 }}>Ответственный: <b>{respName}</b> (текущий пользователь).{f.editId ? ' Сумму и счёт при правке не меняем — балансы защищены (для смены — удалите и создайте заново).' : (isSalary ? ' Выплата идёт через кадры (контроль переплаты).' : '')}</div>
      </Modal>

      <Modal open={catModal} onClose={() => setCatModal(false)} title="🏷 Категории расходов" width={440} footer={<Button variant="outline" onClick={() => setCatModal(false)}>Закрыть</Button>}>
        <div className="erp-cat-add"><Input placeholder="Новая категория" value={newCat} onChange={e => setNewCat(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addCat(); }} /><Button onClick={addCat}>Добавить</Button></div>
        <div style={{ marginTop: 12 }}>{catList.map(c => <div className="erp-cat-row" key={c.id}><span style={{ flex: 1 }}>{c.icon} {c.name}{c.base && <span className="erp-muted" style={{ fontSize: 11 }}> · базовая</span>}</span>{!c.base && <button className="erp-icon-btn" style={{ color: '#dc2626' }} onClick={() => delCat(c)}>🗑️</button>}</div>)}</div>
        <div className="erp-muted" style={{ fontSize: 11, marginTop: 8 }}>Категории и подкатегории веду только я — по кнопке «+». Здесь ничего не удаляется автоматически.</div>
      </Modal>
    </div>
  );
}
