'use client';
import * as React from 'react';
import { formatDate } from '@/lib/format';
import { useApi, apiSend } from '@/lib/api';
import { toast } from '@/lib/toast';
import { Card, Badge, Button, PageTitle, Modal, Field, Input, Select, EmptyRow } from '@/components/ui';

type Movement = { id: string; skuCode?: string | null; productName?: string | null; qty: number; price?: string | number; totalSum?: string | number; supplier?: string | null; docNo?: string | null; author?: string | null; moveDate?: string | null; financeGroup?: string | null; reversedAt?: string | null };
type Product = { id: string; skuCode: string; name: string; price: string | number; costPrice?: string | number | null; currentStock: number };
type Acct = { id: string; name: string; icon?: string | null; section?: string | null; sortOrder?: number | null; balance?: string | number | null };
type Pay = { accountId: string; amount: string };

const SECTIONS = [{ key: 'poverka', no: 1, label: 'Поверка' }, { key: 'sale', no: 2, label: 'Продажа' }, { key: 'other', no: 3, label: 'Прочие операции' }, { key: 'branch', no: 4, label: 'Филиал Астана' }, { key: 'branch_almaty', no: 5, label: 'Филиал Алматы' }];
const num = (v: unknown) => Number(v) || 0;
const fmt = (n: number | string) => (Number(n) || 0).toLocaleString('ru-RU');
const dmy = (d?: string | null) => formatDate(d);
const today = () => new Date().toISOString().slice(0, 10);
const emptyForm = () => ({ open: false, mode: 'existing' as 'existing' | 'new', productId: '', newSku: '', newName: '', newMin: '5', qty: '1', price: '', supplier: '', docNo: '', date: today(), payMode: 'pay' as 'pay' | 'debt', payments: [{ accountId: '', amount: '' }] as Pay[], err: '', saving: false });

export default function PurchasesPage() {
  const { data: buys, error, isLoading, mutate } = useApi<Movement[]>('/api/v2/products/movements?type=IN&limit=200');
  const { data: products, mutate: mutateProducts } = useApi<Product[]>('/api/v2/products');
  const { data: fin } = useApi<{ accounts: Acct[] }>('/api/v2/finance');
  const accounts = fin?.accounts || [];
  const accGroups = SECTIONS.map(s => ({ ...s, accs: accounts.filter(a => (a.section || 'other') === s.key).sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0)) }));

  const [q, setQ] = React.useState('');
  const [f, setF] = React.useState(emptyForm());

  const live = (buys || []).filter(b => !b.reversedAt);
  const list = (buys || []).filter(b => !q.trim() || (`${b.productName} ${b.skuCode} ${b.supplier || ''}`).toLowerCase().includes(q.toLowerCase()));
  const totalSum = live.reduce((s, b) => s + num(b.totalSum), 0);

  // ── форма ──
  const cost = Math.round(num(f.qty) * num(f.price) * 100) / 100;
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
    if (f.mode === 'existing' && !f.productId) { setF(s => ({ ...s, err: 'Выберите товар (или заведите новый)' })); return; }
    if (f.mode === 'new' && (!f.newSku.trim() || !f.newName.trim())) { setF(s => ({ ...s, err: 'Укажите артикул (SKU) и название нового товара' })); return; }
    if (num(f.qty) <= 0) { setF(s => ({ ...s, err: 'Количество больше 0' })); return; }
    // Оплата: «в долг» → без денег; иначе строки с счётом. Одна строка без суммы → вся стоимость.
    let payments: Array<{ accountId: string; amount: number }> = [];
    if (f.payMode === 'pay') {
      payments = f.payments.filter(p => p.accountId && num(p.amount) > 0).map(p => ({ accountId: p.accountId, amount: num(p.amount) }));
      const withAcc = f.payments.filter(p => p.accountId);
      if (!payments.length && withAcc.length === 1 && cost > 0) payments = [{ accountId: withAcc[0].accountId, amount: cost }];
      if (!payments.length) { setF(s => ({ ...s, err: 'Выберите счёт оплаты (или переключите на «В долг»)' })); return; }
    }
    const body: Record<string, unknown> = { qty: num(f.qty), price: num(f.price), supplier: f.supplier || null, docNo: f.docNo || null, moveDate: f.date || null, payments };
    if (f.mode === 'existing') body.productId = f.productId;
    else body.newProduct = { skuCode: f.newSku.trim(), name: f.newName.trim(), minStock: num(f.newMin) || 0, price: 0 };
    setF(s => ({ ...s, saving: true, err: '' }));
    try {
      await apiSend('/api/v2/purchases', 'POST', body);
      setF(s => ({ ...s, open: false })); await mutate(); await mutateProducts();
      toast(payments.length ? '📥 Закуп проведён: товар на складе + списано со счёта' : '📥 Закуп проведён — товар на складе (в долг)');
    } catch (e) { setF(s => ({ ...s, err: (e as Error).message, saving: false })); }
  }

  async function reverse(b: Movement, hard: boolean) {
    const paid = !!b.financeGroup;
    const q1 = hard ? `Удалить закуп «${b.productName}» (${fmt(b.qty)} шт)?` : `Отменить закуп «${b.productName}» (${fmt(b.qty)} шт)?`;
    if (!confirm(`${q1}\n\nТовар вернётся со склада${paid ? ', деньги вернутся на счёт (сторно)' : ''}.${hard ? ' Строка будет удалена.' : ' Строка останется как отменённая.'}`)) return;
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
        <div className="erp-kpi"><div className="erp-kpi-top"><span className="erp-kpi-ico">🛒</span><span className="erp-kpi-label">Закупок</span></div><div className="erp-kpi-val">{live.length}</div></div>
        <div className="erp-kpi"><div className="erp-kpi-top"><span className="erp-kpi-ico">💰</span><span className="erp-kpi-label">Сумма закупок</span></div><div className="erp-kpi-val">{fmt(totalSum)} ₸</div></div>
      </div>

      <Card className="erp-filters" style={{ marginTop: 12 }}><Input placeholder="🔍 Товар, SKU или поставщик" value={q} onChange={e => setQ(e.target.value)} /></Card>

      <Card style={{ marginTop: 12, padding: 0, overflowX: 'auto' }}>
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
                      <td style={rev ? { textDecoration: 'line-through' } : undefined}>{b.productName} <span className="erp-muted" style={{ fontSize: 11 }}>{b.skuCode}</span></td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(b.qty)}</td>
                      <td style={{ textAlign: 'right' }}>{fmt(b.price || 0)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{num(b.totalSum) ? fmt(b.totalSum!) + ' ₸' : '—'}</td>
                      <td>{rev ? <Badge tone="err">✕ Отменён</Badge> : b.financeGroup ? <Badge tone="ok">💳 Оплачен</Badge> : <Badge tone="warn">⏳ В долг</Badge>}</td>
                      <td style={{ fontSize: 12 }}>{b.docNo || '—'}</td>
                      <td className="erp-muted" style={{ fontSize: 12 }}>{b.author || '—'}</td>
                      <td style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>
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

      <Modal open={f.open} onClose={() => setF(s => ({ ...s, open: false }))} title="📥 Новая закупка" width={560}
        footer={<><Button onClick={save} disabled={f.saving}>{f.saving ? 'Сохранение…' : 'Провести закупку'}</Button><Button variant="outline" onClick={() => setF(s => ({ ...s, open: false }))}>Отмена</Button></>}>
        {f.err && <div className="erp-form-err">{f.err}</div>}

        {/* Существующий товар / новый */}
        <div className="erp-chips" style={{ marginBottom: 8 }}>
          <button type="button" className={`erp-chip${f.mode === 'existing' ? ' on' : ''}`} onClick={() => setF(s => ({ ...s, mode: 'existing' }))}>📦 Из базы</button>
          <button type="button" className={`erp-chip${f.mode === 'new' ? ' on' : ''}`} onClick={() => setF(s => ({ ...s, mode: 'new' }))}>➕ Новый товар</button>
        </div>
        {f.mode === 'existing' ? (
          <Field label="Товар" required>
            <Select value={f.productId} onChange={e => { const p = (products || []).find(x => x.id === e.target.value); const c = num(p?.costPrice); setF(s => ({ ...s, productId: e.target.value, price: p ? String(c > 0 ? c : num(p.price)) : s.price })); }}>
              <option value="">— выберите —</option>
              {(products || []).map(p => <option key={p.id} value={p.id}>{p.skuCode} · {p.name} (ост. {p.currentStock})</option>)}
            </Select>
          </Field>
        ) : (
          <>
            <div className="erp-form-row">
              <Field label="Артикул (SKU)" required><Input value={f.newSku} onChange={e => setF(s => ({ ...s, newSku: e.target.value }))} placeholder="SKU-030" /></Field>
              <Field label="Мин. остаток"><Input type="number" min={0} value={f.newMin} onChange={e => setF(s => ({ ...s, newMin: e.target.value }))} /></Field>
            </div>
            <Field label="Название товара" required><Input value={f.newName} onChange={e => setF(s => ({ ...s, newName: e.target.value }))} placeholder="Например: Счётчик воды VODOMER BCKM-15" /></Field>
            <div className="erp-muted" style={{ fontSize: 11, marginTop: -4, marginBottom: 4 }}>Новый товар заведётся в базе автоматически. Цена продажи = 0 (задайте позже в «Складе»); себестоимость = цена закупа.</div>
          </>
        )}

        <div className="erp-form-row">
          <Field label="Количество" required><Input type="number" min={1} value={f.qty} onChange={e => setF(s => ({ ...s, qty: e.target.value }))} /></Field>
          <Field label="Цена закупа за ед. (₸)"><Input type="number" min={0} value={f.price} onChange={e => setF(s => ({ ...s, price: e.target.value }))} /></Field>
        </div>
        <div style={{ textAlign: 'right', fontSize: 14, marginTop: -4 }}>Стоимость закупа: <b>{fmt(cost)} ₸</b></div>

        <Field label="Поставщик"><Input value={f.supplier} onChange={e => setF(s => ({ ...s, supplier: e.target.value }))} /></Field>
        <div className="erp-form-row">
          <Field label="№ документа"><Input value={f.docNo} onChange={e => setF(s => ({ ...s, docNo: e.target.value }))} /></Field>
          <Field label="Дата"><Input type="date" value={f.date} onChange={e => setF(s => ({ ...s, date: e.target.value }))} /></Field>
        </div>

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
                <Input type="number" min={0} value={p.amount} onChange={e => setPayAmount(i, e.target.value)} placeholder="сумма" style={{ textAlign: 'right' }} />
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
    </div>
  );
}
