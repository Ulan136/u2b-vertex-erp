'use client';
import * as React from 'react';
import { formatDate } from '@/lib/format';
import { useApi, apiSend } from '@/lib/api';
import { toast } from '@/lib/toast';
import { Card, Badge, Button, PageTitle, Modal, Field, Input, MoneyInput, Select, EmptyRow } from '@/components/ui';

type Movement = { id: string; skuCode?: string | null; productName?: string | null; qty: number; price?: string | number; totalSum?: string | number; supplier?: string | null; docNo?: string | null; author?: string | null; moveDate?: string | null; comment?: string | null; financeGroup?: string | null; purchaseGroup?: string | null; reversedAt?: string | null };
type Product = { id: string; skuCode: string; name: string; price: string | number; costPrice?: string | number | null; currentStock: number };
type Acct = { id: string; name: string; icon?: string | null; section?: string | null; sortOrder?: number | null; balance?: string | number | null };
type Pay = { accountId: string; amount: string };
type Item = { mode: 'existing' | 'new'; productId: string; newSku: string; newName: string; newMin: string; qty: string; price: string };

const SECTIONS = [{ key: 'poverka', no: 1, label: 'Поверка' }, { key: 'sale', no: 2, label: 'Продажа' }, { key: 'other', no: 3, label: 'Прочие операции' }, { key: 'branch', no: 4, label: 'Филиал Астана' }, { key: 'branch_almaty', no: 5, label: 'Филиал Алматы' }];
const num = (v: unknown) => Number(v) || 0;
const fmt = (n: number | string) => (Number(n) || 0).toLocaleString('ru-RU');
const dmy = (d?: string | null) => formatDate(d);
const today = () => new Date().toISOString().slice(0, 10);
const emptyItem = (): Item => ({ mode: 'existing', productId: '', newSku: '', newName: '', newMin: '5', qty: '1', price: '' });
const emptyForm = () => ({ open: false, items: [emptyItem()], supplier: '', docNo: '', date: today(), payMode: 'pay' as 'pay' | 'debt', payments: [{ accountId: '', amount: '' }] as Pay[], err: '', saving: false });

export default function PurchasesPage() {
  const { data: buys, error, isLoading, mutate } = useApi<Movement[]>('/api/v2/products/movements?type=IN&limit=200');
  const { data: products, mutate: mutateProducts } = useApi<Product[]>('/api/v2/products');
  const { data: fin } = useApi<{ accounts: Acct[] }>('/api/v2/finance');
  const accounts = fin?.accounts || [];
  const accGroups = SECTIONS.map(s => ({ ...s, accs: accounts.filter(a => (a.section || 'other') === s.key).sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0)) }));

  const [q, setQ] = React.useState('');
  const [f, setF] = React.useState(emptyForm());
  const [edit, setEdit] = React.useState<{ id: string; moveDate: string; supplier: string; docNo: string; saving: boolean; err: string } | null>(null);
  const [pay, setPay] = React.useState<{ id: string; cost: number; count: number; payDate: string; rows: Pay[]; saving: boolean; err: string } | null>(null);

  // Закупки = только настоящие закупы. Возвраты товара из продаж (правка/отмена
  // продажи) — это тоже приход (IN), но НЕ закуп: их место в «Журнале склада»,
  // здесь они не показываются (иначе выглядят как «купили в долг» — неверно).
  const isSalesReturn = (b: Movement) => /возврат|отмена продажи/i.test(b.comment || '');
  const purchases = (buys || []).filter(b => !isSalesReturn(b));
  const live = purchases.filter(b => !b.reversedAt);
  const list = purchases.filter(b => !q.trim() || (`${b.productName} ${b.skuCode} ${b.supplier || ''}`).toLowerCase().includes(q.toLowerCase()));
  const totalSum = live.reduce((s, b) => s + num(b.totalSum), 0);

  // ── позиции ──
  const cost = Math.round(f.items.reduce((s, it) => s + num(it.qty) * num(it.price), 0) * 100) / 100;
  function setItemProduct(i: number, value: string) {
    if (value === '__new__') { setF(s => ({ ...s, items: s.items.map((it, j) => j === i ? { ...it, mode: 'new', productId: '' } : it) })); return; }
    const p = (products || []).find(x => x.id === value); const c = num(p?.costPrice);
    setF(s => ({ ...s, items: s.items.map((it, j) => j === i ? { ...it, mode: 'existing', productId: value, price: p ? String(c > 0 ? c : num(p.price)) : it.price } : it) }));
  }
  const setItemField = (i: number, key: keyof Item, v: string) => setF(s => ({ ...s, items: s.items.map((it, j) => j === i ? { ...it, [key]: v } : it) }));
  const addItem = () => setF(s => ({ ...s, items: [...s.items, emptyItem()] }));
  const removeItem = (i: number) => setF(s => ({ ...s, items: s.items.length > 1 ? s.items.filter((_, j) => j !== i) : s.items }));

  // ── оплата ──
  const allocated = f.payments.reduce((s, p) => s + num(p.amount), 0);
  const remaining = Math.round((cost - allocated) * 100) / 100;
  function setPayAccount(i: number, accountId: string) {
    setF(s => { const others = s.payments.reduce((a, p, j) => a + (j === i ? 0 : num(p.amount)), 0); const rem = Math.max(0, Math.round((cost - others) * 100) / 100); return { ...s, payments: s.payments.map((p, j) => j === i ? { ...p, accountId, amount: p.amount || (rem ? String(rem) : '') } : p) }; });
  }
  const setPayAmount = (i: number, v: string) => setF(s => ({ ...s, payments: s.payments.map((p, j) => j === i ? { ...p, amount: v } : p) }));
  const addPay = () => setF(s => ({ ...s, payments: [...s.payments, { accountId: '', amount: '' }] }));
  const removePay = (i: number) => setF(s => ({ ...s, payments: s.payments.length > 1 ? s.payments.filter((_, j) => j !== i) : [{ accountId: '', amount: '' }] }));

  function openNew() { setF({ ...emptyForm(), open: true }); }
  async function save() {
    // позиции → тело + валидация
    const items: Array<Record<string, unknown>> = [];
    for (const it of f.items) {
      if (num(it.qty) <= 0) { setF(s => ({ ...s, err: 'Количество в позиции должно быть больше 0' })); return; }
      if (it.mode === 'existing') {
        if (!it.productId) { setF(s => ({ ...s, err: 'Выберите товар в каждой позиции (или заведите новый)' })); return; }
        items.push({ productId: it.productId, qty: num(it.qty), price: num(it.price) });
      } else {
        if (!it.newSku.trim() || !it.newName.trim()) { setF(s => ({ ...s, err: 'У нового товара укажите артикул (SKU) и название' })); return; }
        items.push({ newProduct: { skuCode: it.newSku.trim(), name: it.newName.trim(), minStock: num(it.newMin) || 0, price: 0 }, qty: num(it.qty), price: num(it.price) });
      }
    }
    // оплата
    let payments: Array<{ accountId: string; amount: number }> = [];
    if (f.payMode === 'pay') {
      payments = f.payments.filter(p => p.accountId && num(p.amount) > 0).map(p => ({ accountId: p.accountId, amount: num(p.amount) }));
      const withAcc = f.payments.filter(p => p.accountId);
      if (!payments.length && withAcc.length === 1 && cost > 0) payments = [{ accountId: withAcc[0].accountId, amount: cost }];
      if (!payments.length) { setF(s => ({ ...s, err: 'Выберите счёт оплаты (или переключите на «В долг»)' })); return; }
    }
    const body = { items, supplier: f.supplier || null, docNo: f.docNo || null, moveDate: f.date || null, payments };
    setF(s => ({ ...s, saving: true, err: '' }));
    try {
      await apiSend('/api/v2/purchases', 'POST', body);
      setF(s => ({ ...s, open: false })); await mutate(); await mutateProducts();
      toast(payments.length ? '📥 Закуп проведён: товар на складе + списано со счёта' : '📥 Закуп проведён — товар на складе (в долг)');
    } catch (e) { setF(s => ({ ...s, err: (e as Error).message, saving: false })); }
  }

  // ── Редактирование метаданных закупа (дата/поставщик/№) ──
  function openEdit(b: Movement) { setEdit({ id: b.id, moveDate: (b.moveDate || '').slice(0, 10), supplier: b.supplier || '', docNo: b.docNo || '', saving: false, err: '' }); }
  async function saveEdit() {
    if (!edit) return;
    setEdit(s => s && { ...s, saving: true, err: '' });
    try {
      await apiSend(`/api/v2/purchases/${edit.id}`, 'PATCH', { moveDate: edit.moveDate || null, supplier: edit.supplier || null, docNo: edit.docNo || null });
      setEdit(null); await mutate(); toast('✅ Закуп обновлён');
    } catch (e) { setEdit(s => s && { ...s, saving: false, err: (e as Error).message }); }
  }

  // ── Погашение долга: Расход со счёта, дата = сегодня (закуп мог быть раньше) ──
  function openPayDebt(b: Movement) {
    const g = (buys || []).filter(x => !x.reversedAt && (b.purchaseGroup ? x.purchaseGroup === b.purchaseGroup : x.id === b.id));
    const cost = Math.round(g.reduce((s, x) => s + num(x.totalSum), 0) * 100) / 100;
    setPay({ id: b.id, cost, count: g.length, payDate: today(), rows: [{ accountId: '', amount: String(cost) }], saving: false, err: '' });
  }
  async function savePayDebt() {
    if (!pay) return;
    const payments = pay.rows.filter(p => p.accountId && num(p.amount) > 0).map(p => ({ accountId: p.accountId, amount: num(p.amount) }));
    if (!payments.length) { setPay(s => s && { ...s, err: 'Выберите счёт и сумму' }); return; }
    setPay(s => s && { ...s, saving: true, err: '' });
    try {
      await apiSend(`/api/v2/purchases/${pay.id}/pay`, 'POST', { payments, payDate: pay.payDate || null });
      setPay(null); await mutate(); toast('💳 Долг погашен — расход проведён');
    } catch (e) { setPay(s => s && { ...s, saving: false, err: (e as Error).message }); }
  }

  async function reverse(b: Movement, hard: boolean) {
    const paid = !!b.financeGroup; const multi = !!b.purchaseGroup;
    const head = hard ? `Удалить закуп «${b.productName}»?` : `Отменить закуп «${b.productName}»?`;
    if (!confirm(`${head}\n\n${multi ? 'Отменится весь закуп (все его позиции). ' : ''}Товар вернётся со склада${paid ? ', деньги вернутся на счёт (сторно)' : ''}.${hard ? ' Строки будут удалены.' : ' Строки останутся как отменённые.'}`)) return;
    try {
      if (hard) await apiSend(`/api/v2/products/movements/${b.id}`, 'DELETE');
      else await apiSend(`/api/v2/products/movements/${b.id}/reverse`, 'POST');
      await mutate(); await mutateProducts(); toast(hard ? '🗑️ Закуп удалён' : '↩️ Закуп отменён');
    } catch (e) { toast('⚠️ ' + (e as Error).message); }
  }

  return (
    <div>
      <PageTitle title="Закупки" sub="Приход товара от поставщиков — склад пополняется, деньги списываются со счёта" action={<Button onClick={openNew}>+ Новая закупка</Button>} />

      <div className="erp-kpi-grid">
        <div className="erp-kpi"><div className="erp-kpi-top"><span className="erp-kpi-ico">🛒</span><span className="erp-kpi-label">Позиций закуплено</span></div><div className="erp-kpi-val">{live.length}</div></div>
        <div className="erp-kpi"><div className="erp-kpi-top"><span className="erp-kpi-ico">💰</span><span className="erp-kpi-label">Сумма закупок</span></div><div className="erp-kpi-val">{fmt(totalSum)} ₸</div></div>
      </div>

      <Card className="erp-filters" style={{ marginTop: 12 }}><Input placeholder="🔍 Товар, SKU или поставщик" value={q} onChange={e => setQ(e.target.value)} /></Card>

      <Card className="erp-journal" style={{ marginTop: 12, padding: 0 }}>
        {error ? <EmptyRow>Нет доступа к закупкам.</EmptyRow> : isLoading ? <EmptyRow>Загрузка…</EmptyRow>
          : list.length === 0 ? <EmptyRow>Закупок пока нет. Нажмите «+ Новая закупка».</EmptyRow>
          : (
            <table className="erp-table">
              <thead><tr><th>Дата</th><th>Поставщик</th><th>Товар</th><th style={{ textAlign: 'right' }}>Кол-во</th><th style={{ textAlign: 'right' }}>Цена</th><th style={{ textAlign: 'right' }}>Сумма</th><th>Оплата</th><th>Документ</th><th>Автор</th><th style={{ textAlign: 'center' }}>Действия</th></tr></thead>
              <tbody>
                {list.map(b => {
                  const rev = !!b.reversedAt;
                  return (
                    <tr key={b.id} style={rev ? { opacity: 0.55 } : undefined}>
                      <td className="erp-muted" style={{ fontSize: 12 }}>{dmy(b.moveDate)}</td>
                      <td className="erp-td-main" style={rev ? { textDecoration: 'line-through' } : undefined}>{b.supplier || '—'}</td>
                      <td style={rev ? { textDecoration: 'line-through' } : undefined}>{b.productName} <span className="erp-muted" style={{ fontSize: 11 }}>{b.skuCode}</span>{b.purchaseGroup && <span className="erp-muted" style={{ fontSize: 11 }} title="Позиция мультизакупа"> · 📦</span>}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(b.qty)}</td>
                      <td style={{ textAlign: 'right' }}>{fmt(b.price || 0)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{num(b.totalSum) ? fmt(b.totalSum!) + ' ₸' : '—'}</td>
                      <td>{rev ? <Badge tone="err">✕ Отменён</Badge> : b.financeGroup ? <Badge tone="ok">💳 Оплачен</Badge> : <Badge tone="warn">⏳ В долг</Badge>}</td>
                      <td style={{ fontSize: 12 }}>{b.docNo || '—'}</td>
                      <td className="erp-muted" style={{ fontSize: 12 }}>{b.author || '—'}</td>
                      <td style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>
                        {!rev && <button className="erp-icon-btn" title="Редактировать (дата, поставщик, №)" onClick={() => openEdit(b)}>✏️</button>}
                        {!rev && !b.financeGroup && <button className="erp-icon-btn" title="Погасить долг" style={{ color: '#16a34a' }} onClick={() => openPayDebt(b)}>💵</button>}
                        {!rev && <button className="erp-icon-btn" title="Отменить (склад + деньги, строка останется)" onClick={() => reverse(b, false)}>↩️</button>}
                        <button className="erp-icon-btn" title="Удалить закуп" style={{ color: '#dc2626' }} onClick={() => reverse(b, true)}>🗑️</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
      </Card>

      <Modal open={f.open} onClose={() => setF(s => ({ ...s, open: false }))} title="📥 Новая закупка" width={680}
        footer={<><Button onClick={save} disabled={f.saving}>{f.saving ? 'Сохранение…' : 'Провести закупку'}</Button><Button variant="outline" onClick={() => setF(s => ({ ...s, open: false }))}>Отмена</Button></>}>
        {f.err && <div className="erp-form-err">{f.err}</div>}

        <Field label="Позиции закупа" required>
          <table className="erp-table" style={{ fontSize: 12 }}>
            <thead><tr><th style={{ textAlign: 'left' }}>Товар</th><th style={{ width: 66 }}>Кол-во</th><th style={{ width: 110 }}>Цена закупа</th><th style={{ width: 92 }}>Сумма</th><th style={{ width: 30 }}></th></tr></thead>
            <tbody>
              {f.items.map((it, i) => (
                <tr key={i}>
                  <td>
                    <Select value={it.mode === 'new' ? '__new__' : it.productId} onChange={e => setItemProduct(i, e.target.value)}>
                      <option value="">— выберите —</option>
                      <option value="__new__">➕ Новый товар…</option>
                      {(products || []).map(p => <option key={p.id} value={p.id}>{p.skuCode} · {p.name} (ост. {p.currentStock})</option>)}
                    </Select>
                    {it.mode === 'new' && (
                      <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                        <Input placeholder="SKU" value={it.newSku} onChange={e => setItemField(i, 'newSku', e.target.value)} style={{ padding: '4px 6px', width: 90 }} />
                        <Input placeholder="Название нового товара" value={it.newName} onChange={e => setItemField(i, 'newName', e.target.value)} style={{ padding: '4px 6px', flex: 1 }} />
                        <Input type="number" min={0} placeholder="мин" title="Мин. остаток" value={it.newMin} onChange={e => setItemField(i, 'newMin', e.target.value)} style={{ padding: '4px 6px', width: 56 }} />
                      </div>
                    )}
                  </td>
                  <td><Input type="number" min={1} value={it.qty} onChange={e => setItemField(i, 'qty', e.target.value)} style={{ padding: '4px 6px', textAlign: 'center' }} /></td>
                  <td><MoneyInput value={it.price} onValue={v => setItemField(i, 'price', v)} style={{ padding: '4px 6px', textAlign: 'right' }} /></td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(num(it.qty) * num(it.price))}</td>
                  <td style={{ textAlign: 'center' }}><button type="button" className="erp-icon-btn" style={{ color: '#dc2626' }} onClick={() => removeItem(i)} title="Убрать позицию" disabled={f.items.length <= 1}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <Button variant="outline" onClick={addItem} style={{ marginTop: 8, fontSize: 12 }}>➕ Добавить позицию</Button>
          <div style={{ textAlign: 'right', marginTop: 8, fontSize: 15 }}>Итого закуп: <b>{fmt(cost)} ₸</b></div>
          <div className="erp-muted" style={{ fontSize: 11, marginTop: 2 }}>«➕ Новый товар…» — если SKU ещё нет в базе, товар заведётся автоматически (цена продажи 0 — задать позже в «Складе»; себестоимость = цена закупа).</div>
        </Field>

        <div className="erp-form-row">
          <Field label="Поставщик"><Input value={f.supplier} onChange={e => setF(s => ({ ...s, supplier: e.target.value }))} /></Field>
          <Field label="Дата"><Input type="date" value={f.date} onChange={e => setF(s => ({ ...s, date: e.target.value }))} /></Field>
        </div>
        <Field label="№ документа"><Input value={f.docNo} onChange={e => setF(s => ({ ...s, docNo: e.target.value }))} /></Field>

        {/* Оплата — с каких счетов списать */}
        <div className="cert-sec-lbl">🧾 Оплата — с каких счетов списать</div>
        <div className="erp-chips" style={{ marginBottom: 6 }}>
          <button type="button" className={`erp-chip${f.payMode === 'pay' ? ' on' : ''}`} onClick={() => setF(s => ({ ...s, payMode: 'pay' }))}>💳 Оплатить сейчас</button>
          <button type="button" className={`erp-chip${f.payMode === 'debt' ? ' on' : ''}`} onClick={() => setF(s => ({ ...s, payMode: 'debt' }))}>⏳ В долг (без денег)</button>
        </div>
        {f.payMode === 'debt' ? (
          <div className="erp-muted" style={{ fontSize: 12 }}>Закуп проведётся без списания денег — только приход на склад. Долг поставщику ведите отдельно.</div>
        ) : (
          <div className="sale-pay" style={{ marginTop: 0 }}>
            {f.payments.map((p, i) => (
              <div className="sale-pay-row" key={i}>
                <Select value={p.accountId} onChange={e => setPayAccount(i, e.target.value)}>
                  <option value="">— выберите счёт —</option>
                  {accGroups.map(g => g.accs.length === 0 ? null : (
                    <optgroup key={g.key} label={`№${g.no} ${g.label}`}>
                      {g.accs.map(a => <option key={a.id} value={a.id}>{a.icon || '💳'} {a.name} · {fmt(a.balance ?? 0)}</option>)}
                    </optgroup>
                  ))}
                </Select>
                <MoneyInput value={p.amount} onValue={v => setPayAmount(i, v)} placeholder="сумма" style={{ textAlign: 'right' }} />
                <button type="button" className="erp-icon-btn" style={{ color: '#dc2626' }} onClick={() => removePay(i)} title="Убрать">✕</button>
              </div>
            ))}
            <Button variant="outline" onClick={addPay} style={{ fontSize: 12 }}>+ Добавить счёт</Button>
            <div className="sale-pay-state">
              <span>Распределено: <b style={{ color: '#16a34a' }}>{fmt(allocated)}</b></span>
              <span>Осталось: <b style={{ color: remaining !== 0 ? '#b45309' : '#16a34a' }}>{fmt(remaining)} ₸</b></span>
            </div>
            <div className="erp-muted" style={{ fontSize: 11 }}>Одна строка без суммы — спишется вся стоимость закупа с выбранного счёта. Каждая строка = свой расход в Финансах (source «Закуп»). Отмена/удаление закупа вернёт и товар, и деньги.</div>
          </div>
        )}
      </Modal>

      {/* Редактирование закупа: дата / поставщик / № документа */}
      <Modal open={!!edit} onClose={() => setEdit(null)} title="✏️ Редактировать закуп" width={480}
        footer={<><Button onClick={saveEdit} disabled={edit?.saving}>{edit?.saving ? 'Сохранение…' : '💾 Сохранить'}</Button><Button variant="outline" onClick={() => setEdit(null)}>Отмена</Button></>}>
        {edit?.err && <div className="erp-form-err">{edit.err}</div>}
        <div className="erp-form-row">
          <Field label="Дата закупа"><Input type="date" value={edit?.moveDate || ''} onChange={e => setEdit(s => s && { ...s, moveDate: e.target.value })} /></Field>
          <Field label="Поставщик"><Input value={edit?.supplier || ''} onChange={e => setEdit(s => s && { ...s, supplier: e.target.value })} /></Field>
        </div>
        <Field label="№ документа"><Input value={edit?.docNo || ''} onChange={e => setEdit(s => s && { ...s, docNo: e.target.value })} /></Field>
        <div className="erp-muted" style={{ fontSize: 11, marginTop: 8 }}>Меняются дата/поставщик/№ у всех позиций этого закупа. Кол-во/цену/оплату здесь не правим — через отмену и повторный закуп (чтобы склад и деньги пересчитались корректно).</div>
      </Modal>

      {/* Погашение долга */}
      <Modal open={!!pay} onClose={() => setPay(null)} title="💵 Погасить долг" width={480}
        footer={<><Button onClick={savePayDebt} disabled={pay?.saving}>{pay?.saving ? 'Проведение…' : '💳 Погасить'}</Button><Button variant="outline" onClick={() => setPay(null)}>Отмена</Button></>}>
        {pay?.err && <div className="erp-form-err">{pay.err}</div>}
        <div className="erp-muted" style={{ fontSize: 13, marginBottom: 8 }}>Долг: <b style={{ color: '#b45309' }}>{fmt(pay?.cost || 0)} ₸</b>{pay && pay.count > 1 ? ` · ${pay.count} поз.` : ''}. Оплата проведётся выбранной датой (по умолчанию — сегодня; сам закуп остаётся своей датой).</div>
        <Field label="Дата оплаты"><Input type="date" value={pay?.payDate || ''} onChange={e => setPay(s => s && { ...s, payDate: e.target.value })} /></Field>
        <div className="cert-sec-lbl">🧾 С каких счетов списать</div>
        <div className="sale-pay" style={{ marginTop: 0 }}>
          {pay?.rows.map((p, i) => (
            <div className="sale-pay-row" key={i}>
              <Select value={p.accountId} onChange={e => setPay(s => s && { ...s, rows: s.rows.map((r, j) => j === i ? { ...r, accountId: e.target.value } : r) })}>
                <option value="">— выберите счёт —</option>
                {accGroups.map(g => g.accs.length === 0 ? null : (
                  <optgroup key={g.key} label={`№${g.no} ${g.label}`}>
                    {g.accs.map(a => <option key={a.id} value={a.id}>{a.icon || '💳'} {a.name} · {fmt(a.balance ?? 0)}</option>)}
                  </optgroup>
                ))}
              </Select>
              <MoneyInput value={p.amount} onValue={v => setPay(s => s && { ...s, rows: s.rows.map((r, j) => j === i ? { ...r, amount: v } : r) })} placeholder="сумма" style={{ textAlign: 'right' }} />
              <button type="button" className="erp-icon-btn" style={{ color: '#dc2626' }} onClick={() => setPay(s => s && { ...s, rows: s.rows.length > 1 ? s.rows.filter((_, j) => j !== i) : s.rows })} title="Убрать">✕</button>
            </div>
          ))}
          <Button variant="outline" onClick={() => setPay(s => s && { ...s, rows: [...s.rows, { accountId: '', amount: '' }] })} style={{ fontSize: 12 }}>+ Добавить счёт</Button>
        </div>
      </Modal>
    </div>
  );
}
