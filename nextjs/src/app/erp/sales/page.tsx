'use client';
import * as React from 'react';
import { useApi, apiSend } from '@/lib/api';
import { toast } from '@/lib/toast';
import { Card, Badge, Button, PageTitle, Modal, Field, Input, Select, EmptyRow } from '@/components/ui';
import EntityHistory from '@/components/erp/EntityHistory';

type SaleItem = { productId: string; productName?: string | null; skuCode?: string | null; qty: number; price: number; sum: number };
type SalePay = { accountId: string; accountName?: string | null; amount: number };
type Sale = { id: string; saleNo?: string | null; saleDate?: string | null; clientName?: string | null; clientType?: string | null; productName?: string | null; skuCode?: string | null; qty?: number; price?: string | number; totalSum?: string | number; payStatus?: string | null; paidSum?: number; payments?: SalePay[]; invoiceType?: string | null; items?: SaleItem[] | null; comment?: string | null; cancelledAt?: string | null; createdByName?: string | null };
type Client = { id: string; name: string };
type Product = { id: string; skuCode: string; name: string; price: string | number; priceDiscount?: string | number | null; currentStock: number };
type Acct = { id: string; name: string; section?: string | null; icon?: string | null };
type FormItem = { productId: string; productName: string; skuCode: string; qty: string; price: string };
type FormPay = { accountId: string; amount: string };

const num = (v: unknown) => Number(v) || 0;
const fmt = (n: number | string) => (Number(n) || 0).toLocaleString('ru-RU');
const dmy = (d?: string | null) => (d ? String(d).slice(0, 10).split('-').reverse().join('.') : '');
const iso = (d?: string | null) => (d ? String(d).slice(0, 10) : '');
const today = () => new Date().toISOString().slice(0, 10);
const CLIENT_TYPES: Array<[string, string]> = [['retail', '🛒 Покупатель'], ['client', '🤝 Клиент (скидка)']];
const clientTypeLabel = (t?: string | null) => (t === 'client' ? 'Клиент' : 'Покупатель');
// Статус оплаты (как на сервере): сумма оплат = итогу → Оплачено; часть → Частично; 0 → Ожидает.
function payState(total: number, paid: number): 'Оплачено' | 'Частично' | 'Ожидает' {
  if (paid <= 0.005) return 'Ожидает';
  if (paid + 0.005 >= total) return 'Оплачено';
  return 'Частично';
}
function priceFor(p: Product | undefined, ct: string): number {
  if (!p) return 0;
  if (ct === 'client') { const d = num(p.priceDiscount); return d > 0 ? d : num(p.price); }
  return num(p.price);
}
const emptyItem = (): FormItem => ({ productId: '', productName: '', skuCode: '', qty: '1', price: '' });
const emptyPay = (): FormPay => ({ accountId: '', amount: '' });
const emptyForm = () => ({ id: '', cloneFrom: '', clientName: '', clientType: 'retail', saleDate: today(), comment: '', items: [emptyItem()], payments: [emptyPay()] });

export default function SalesPage() {
  const { data: sales, error, isLoading, mutate } = useApi<Sale[]>('/api/v2/sales');
  const { data: clients } = useApi<Client[]>('/api/v2/clients');
  const { data: products } = useApi<Product[]>('/api/v2/products');
  const { data: fin } = useApi<{ accounts: Acct[] }>('/api/v2/finance');
  const { data: session } = useApi<{ user?: { role?: string } }>('/api/auth/session');
  const canCancel = ['admin', 'accountant'].includes(session?.user?.role || '');
  const saleAccounts = (fin?.accounts || []).filter(a => (a.section || '') === 'sale');

  const [modal, setModal] = React.useState(false);
  const [form, setForm] = React.useState(emptyForm());
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState('');
  const [histSale, setHistSale] = React.useState<Sale | null>(null);
  const [topup, setTopup] = React.useState<{ open: boolean; sale: Sale | null; rows: FormPay[]; err: string; saving: boolean }>({ open: false, sale: null, rows: [emptyPay()], err: '', saving: false });

  const list = sales || [];
  const active = list.filter(x => !x.cancelledAt);
  const total = active.reduce((s, x) => s + num(x.totalSum), 0);
  const paidSum = active.reduce((s, x) => s + num(x.paidSum), 0);
  const pendingSum = total - paidSum;

  // ── форма позиций ──
  const formTotal = form.items.reduce((s, it) => s + num(it.qty) * num(it.price), 0);
  const allocated = form.payments.reduce((s, p) => s + num(p.amount), 0);
  const remaining = Math.max(0, Math.round((formTotal - allocated) * 100) / 100);
  const formStatus = payState(formTotal, allocated);

  function setItemProduct(i: number, productId: string) {
    const p = (products || []).find(x => x.id === productId);
    setForm(f => ({ ...f, items: f.items.map((it, j) => j === i ? { ...it, productId, productName: p?.name || '', skuCode: p?.skuCode || '', price: p ? String(priceFor(p, f.clientType)) : it.price } : it) }));
  }
  const setItemField = (i: number, key: 'qty' | 'price', v: string) => setForm(f => ({ ...f, items: f.items.map((it, j) => j === i ? { ...it, [key]: v } : it) }));
  const addItem = () => setForm(f => ({ ...f, items: [...f.items, emptyItem()] }));
  const removeItem = (i: number) => setForm(f => ({ ...f, items: f.items.length > 1 ? f.items.filter((_, j) => j !== i) : f.items }));
  function setClientType(ct: string) {
    setForm(f => ({ ...f, clientType: ct, items: f.items.map(it => { const p = (products || []).find(x => x.id === it.productId); return p ? { ...it, price: String(priceFor(p, ct)) } : it; }) }));
  }
  // ── строки оплаты ──
  function setPayAccount(i: number, accountId: string) {
    setForm(f => {
      const others = f.payments.reduce((s, p, j) => s + (j === i ? 0 : num(p.amount)), 0);
      const rem = Math.max(0, Math.round((f.items.reduce((s, it) => s + num(it.qty) * num(it.price), 0) - others) * 100) / 100);
      return { ...f, payments: f.payments.map((p, j) => j === i ? { ...p, accountId, amount: p.amount || (rem ? String(rem) : '') } : p) };
    });
  }
  const setPayAmount = (i: number, v: string) => setForm(f => ({ ...f, payments: f.payments.map((p, j) => j === i ? { ...p, amount: v } : p) }));
  const addPay = () => setForm(f => ({ ...f, payments: [...f.payments, emptyPay()] }));
  const removePay = (i: number) => setForm(f => ({ ...f, payments: f.payments.length > 1 ? f.payments.filter((_, j) => j !== i) : [emptyPay()] }));

  const itemsToForm = (s: Sale): FormItem[] => (s.items && s.items.length)
    ? s.items.map(i => ({ productId: i.productId, productName: i.productName || '', skuCode: i.skuCode || '', qty: String(i.qty), price: String(i.price) }))
    : [emptyItem()];

  function openNew() { setForm(emptyForm()); setErr(''); setModal(true); }
  function openClone(s: Sale) {
    setForm({ id: '', cloneFrom: `${s.saleNo || ''} · ${s.clientName || ''}`, clientName: s.clientName || '', clientType: s.clientType || 'retail', saleDate: today(), comment: s.comment || '', items: itemsToForm(s), payments: [emptyPay()] });
    setErr(''); setModal(true);
  }
  function openEdit(s: Sale) {
    setForm({ id: s.id, cloneFrom: '', clientName: s.clientName || '', clientType: s.clientType || 'retail', saleDate: iso(s.saleDate) || today(), comment: s.comment || '', items: itemsToForm(s), payments: [emptyPay()] });
    setErr(''); setModal(true);
  }

  async function save() {
    if (!form.clientName.trim()) { setErr('Укажите клиента'); return; }
    const items = form.items.filter(it => it.productId && num(it.qty) > 0).map(it => ({ productId: it.productId, productName: it.productName, skuCode: it.skuCode, qty: num(it.qty), price: num(it.price) }));
    if (!items.length) { setErr('Добавьте хотя бы одну позицию со складом'); return; }
    const payments = form.payments.filter(p => p.accountId && num(p.amount) > 0).map(p => ({ accountId: p.accountId, amount: num(p.amount) }));
    if (allocated - formTotal > 0.005) { setErr('Распределено больше итога — уменьшите оплату'); return; }
    setSaving(true); setErr('');
    const body: Record<string, unknown> = { clientName: form.clientName.trim(), clientType: form.clientType, items, saleDate: form.saleDate || null, comment: form.comment || null };
    if (!form.id) body.payments = payments;   // оплаты задаются только при создании; правка — через «Дооплату»
    try {
      if (form.id) await apiSend(`/api/v2/sales/${form.id}`, 'PATCH', body);
      else await apiSend('/api/v2/sales', 'POST', body);
      setModal(false); await mutate();
      toast(form.id ? '✅ Продажа обновлена' : (payments.length ? '✅ Продажа проведена: приходы в финансы + списан склад' : '✅ Продажа записана (ожидает оплаты)'));
    } catch (e) { setErr((e as Error).message); } finally { setSaving(false); }
  }

  // ── дооплата ──
  function openTopup(s: Sale) {
    const rem = Math.max(0, num(s.totalSum) - num(s.paidSum));
    setTopup({ open: true, sale: s, rows: [{ accountId: '', amount: rem ? String(rem) : '' }], err: '', saving: false });
  }
  const topupTotal = topup.rows.reduce((s, p) => s + num(p.amount), 0);
  const topupRemaining = topup.sale ? Math.max(0, num(topup.sale.totalSum) - num(topup.sale.paidSum)) : 0;
  function setTopupAccount(i: number, accountId: string) {
    setTopup(t => { const others = t.rows.reduce((s, p, j) => s + (j === i ? 0 : num(p.amount)), 0); const rem = Math.max(0, topupRemaining - others); return { ...t, rows: t.rows.map((p, j) => j === i ? { ...p, accountId, amount: p.amount || (rem ? String(rem) : '') } : p) }; });
  }
  async function confirmTopup() {
    if (!topup.sale) return;
    const rows = topup.rows.filter(p => p.accountId && num(p.amount) > 0).map(p => ({ accountId: p.accountId, amount: num(p.amount) }));
    if (!rows.length) { setTopup(t => ({ ...t, err: 'Выберите счёт и сумму' })); return; }
    if (topupTotal - topupRemaining > 0.005) { setTopup(t => ({ ...t, err: `Больше остатка нельзя: осталось ${fmt(topupRemaining)} ₸` })); return; }
    setTopup(t => ({ ...t, saving: true, err: '' }));
    try {
      await apiSend(`/api/v2/sales/${topup.sale.id}/payments`, 'POST', { payments: rows });
      setTopup({ open: false, sale: null, rows: [emptyPay()], err: '', saving: false }); await mutate(); toast('💵 Дооплата проведена: приход(ы) в финансы');
    } catch (e) { setTopup(t => ({ ...t, err: (e as Error).message, saving: false })); }
  }

  async function cancelSale(s: Sale) {
    if (!confirm(`Отменить продажу ${s.saleNo}?\n\nВсе её оплаты сторнируются по своим счетам, остаток вернётся на склад. Продажа останется в журнале как «Отменена».`)) return;
    try { await apiSend(`/api/v2/sales/${s.id}/cancel`, 'POST'); await mutate(); toast('↩️ Продажа отменена: сторно оплат + возврат склада'); }
    catch (e) { toast('⚠️ ' + (e as Error).message); }
  }

  // ── экспорт ──
  const accSummary = (s: Sale) => Array.from(new Set((s.payments || []).map(p => p.accountName).filter(Boolean))).join(' + ');
  async function exportWord() {
    const rows = active.map(s => [s.saleNo || '', dmy(s.saleDate), s.clientName || '', clientTypeLabel(s.clientType), s.productName || '', fmt(s.qty || 0), fmt(s.totalSum || 0), s.payStatus || 'Ожидает', accSummary(s)]);
    const spec = {
      titleLines: ['Журнал продаж'], subtitle: `Продаж: ${active.length} · на ${fmt(total)} ₸`, orientation: 'landscape',
      columns: [{ header: '№', width: 8 }, { header: 'Дата', width: 10 }, { header: 'Клиент', width: 20, align: 'left' }, { header: 'Тип', width: 10 }, { header: 'Товар', width: 22, align: 'left' }, { header: 'Кол-во', width: 8, align: 'right' }, { header: 'Сумма', width: 12, align: 'right' }, { header: 'Оплата', width: 10 }, { header: 'Счёт', width: 12 }],
      rows, totalRow: ['', '', '', '', 'ИТОГО', '', fmt(total), '', ''], filename: 'Журнал_продаж.docx',
    };
    try {
      const r = await fetch('/api/v2/docx', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(spec) });
      if (!r.ok) throw new Error('Ошибка выгрузки');
      const b = await r.blob(); const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(b), download: 'Журнал_продаж.docx' });
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (e) { toast('⚠️ ' + (e as Error).message); }
  }
  function printJournal() {
    const rows = active.map(s => `<tr><td>${s.saleNo || ''}</td><td>${dmy(s.saleDate)}</td><td style="text-align:left">${s.clientName || ''}</td><td>${clientTypeLabel(s.clientType)}</td><td style="text-align:left">${s.productName || ''}</td><td>${fmt(s.qty || 0)}</td><td style="text-align:right">${fmt(s.totalSum || 0)} ₸</td><td>${s.payStatus || 'Ожидает'}</td></tr>`).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Журнал продаж</title><style>@page{size:A4 landscape;margin:12mm}body{font-family:'Times New Roman',serif;font-size:12px}h2{text-align:center;margin:0 0 4px}table{width:100%;border-collapse:collapse;margin-top:8px}td,th{border:1px solid #000;padding:4px;text-align:center}</style></head><body><h2>Журнал продаж</h2><div style="text-align:center;margin-bottom:6px">Продаж: ${active.length} · на ${fmt(total)} ₸</div><table><thead><tr><th>№</th><th>Дата</th><th>Клиент</th><th>Тип</th><th>Товар</th><th>Кол-во</th><th>Сумма</th><th>Оплата</th></tr></thead><tbody>${rows}</tbody></table><script>window.onload=()=>window.print()<\/script></body></html>`;
    const b = new Blob([html], { type: 'text/html' }); const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(b), target: '_blank' }); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  const statusBadge = (s: Sale) => {
    if (s.cancelledAt) return <Badge tone="err">✕ Отменена</Badge>;
    const st = s.payStatus || 'Ожидает';
    if (st === 'Оплачено') return <Badge tone="ok">✓ Оплачено</Badge>;
    if (st === 'Частично') return <span><Badge tone="warn">◐ Частично</Badge> <span className="erp-muted" style={{ fontSize: 11 }}>{fmt(s.paidSum || 0)} из {fmt(s.totalSum || 0)}</span></span>;
    return <Badge tone="warn">⏳ Ожидает</Badge>;
  };

  return (
    <div>
      <PageTitle title="Продажи" sub={`Активных: ${active.length}`} action={
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="outline" onClick={printJournal}>📤 Печать</Button>
          <Button variant="outline" onClick={exportWord}>⬇ Word</Button>
          <Button onClick={openNew}>+ Продажа</Button>
        </div>} />

      <div className="erp-kpi-grid">
        <div className="erp-kpi"><div className="erp-kpi-top"><span className="erp-kpi-ico">💰</span><span className="erp-kpi-label">Итого продаж</span></div><div className="erp-kpi-val">{fmt(total)} ₸</div></div>
        <div className="erp-kpi"><div className="erp-kpi-top"><span className="erp-kpi-ico">✅</span><span className="erp-kpi-label">Оплачено</span></div><div className="erp-kpi-val" style={{ color: '#16a34a' }}>{fmt(paidSum)} ₸</div></div>
        <div className="erp-kpi"><div className="erp-kpi-top"><span className="erp-kpi-ico">⏳</span><span className="erp-kpi-label">Ожидает оплаты</span></div><div className="erp-kpi-val" style={{ color: '#b45309' }}>{fmt(pendingSum)} ₸</div></div>
      </div>

      <Card style={{ padding: 0, marginTop: 12, overflowX: 'auto' }}>
        {error ? <EmptyRow>Нет доступа к продажам.</EmptyRow> : isLoading ? <EmptyRow>Загрузка…</EmptyRow>
          : list.length === 0 ? <EmptyRow>Продаж пока нет. Нажмите «+ Продажа».</EmptyRow>
          : (
            <table className="erp-table">
              <thead><tr><th>№</th><th>Дата</th><th>Клиент</th><th>Тип</th><th>Товар</th><th style={{ textAlign: 'right' }}>Кол-во</th><th style={{ textAlign: 'right' }}>Сумма</th><th>Оплата</th><th>Счёт</th><th>Автор</th><th></th></tr></thead>
              <tbody>
                {list.map(s => {
                  const cancelled = !!s.cancelledAt;
                  const st = s.payStatus || 'Ожидает';
                  const canTopup = !cancelled && (st === 'Ожидает' || st === 'Частично');
                  return (
                    <tr key={s.id} style={cancelled ? { opacity: 0.55 } : undefined}>
                      <td className="erp-muted" style={{ fontSize: 12 }}>{s.saleNo}</td>
                      <td className="erp-muted" style={{ fontSize: 12 }}>{dmy(s.saleDate)}</td>
                      <td className="erp-td-main">{s.clientName || '—'}</td>
                      <td><Badge tone={s.clientType === 'client' ? 'info' : 'neutral'}>{s.clientType === 'client' ? '🤝 Клиент' : '🛒 Покупатель'}</Badge></td>
                      <td style={cancelled ? { textDecoration: 'line-through' } : undefined}>{s.productName || '—'} {s.skuCode && <span className="erp-muted" style={{ fontSize: 11 }}>{s.skuCode}</span>}</td>
                      <td style={{ textAlign: 'right' }}>{fmt(s.qty || 0)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, ...(cancelled ? { textDecoration: 'line-through' } : {}) }}>{fmt(s.totalSum || 0)} ₸</td>
                      <td>{statusBadge(s)}</td>
                      <td className="erp-muted" style={{ fontSize: 12 }}>{accSummary(s) || '—'}</td>
                      <td className="erp-muted" style={{ fontSize: 12 }}>{s.createdByName || '—'}</td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {canTopup && <button className="erp-icon-btn" title="Дооплата" style={{ color: '#16a34a' }} onClick={() => openTopup(s)}>💵</button>}
                        <button className="erp-icon-btn" title="Клонировать" onClick={() => openClone(s)}>⧉</button>
                        {!cancelled && <button className="erp-icon-btn" title="Изменить" onClick={() => openEdit(s)}>✏️</button>}
                        <button className="erp-icon-btn" title="История" onClick={() => setHistSale(s)}>🕘</button>
                        {!cancelled && canCancel && <button className="erp-icon-btn" title="Отменить продажу" onClick={() => cancelSale(s)}>↩️</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
      </Card>

      {/* ── Модалка продажи (мультипозиция + смешанная оплата) ── */}
      <Modal open={modal} onClose={() => setModal(false)}
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>{form.id ? '✏️ Продажа' : '➕ Новая продажа'}{form.cloneFrom && <span className="sale-clone-badge">⧉ на основе {form.cloneFrom}</span>}</span>} width={700}
        footer={<><Button onClick={save} disabled={saving}>{saving ? 'Сохранение…' : (form.id ? 'Сохранить' : 'Провести продажу')}</Button><Button variant="outline" onClick={() => setModal(false)}>Отмена</Button></>}>
        {err && <div className="erp-form-err">{err}</div>}
        <Field label="Клиент" required>
          <Select value="" onChange={e => { const c = (clients || []).find(x => x.id === e.target.value); if (c) setForm(f => ({ ...f, clientName: c.name })); }}>
            <option value="">— из клиентов или впишите ниже —</option>
            {(clients || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Input value={form.clientName} onChange={e => setForm(f => ({ ...f, clientName: e.target.value }))} placeholder="ФИО / название" style={{ marginTop: 6 }} />
        </Field>
        <Field label="Тип клиента">
          <div className="erp-chips">{CLIENT_TYPES.map(([v, l]) => <button key={v} type="button" className={`erp-chip${form.clientType === v ? ' on' : ''}`} onClick={() => setClientType(v)}>{l}</button>)}</div>
          <div className="erp-muted" style={{ fontSize: 11, marginTop: 4 }}>«Клиент» подставляет цену со скидкой (можно поправить вручную).</div>
        </Field>

        <Field label="Товары" required>
          <table className="erp-table" style={{ fontSize: 12 }}>
            <thead><tr><th style={{ textAlign: 'left' }}>Товар</th><th style={{ width: 66 }}>Кол-во</th><th style={{ width: 96 }}>Цена</th><th style={{ width: 96 }}>Сумма</th><th style={{ width: 30 }}></th></tr></thead>
            <tbody>
              {form.items.map((it, i) => {
                const p = (products || []).find(x => x.id === it.productId);
                return (
                  <tr key={i}>
                    <td>
                      <Select value={it.productId} onChange={e => setItemProduct(i, e.target.value)}>
                        <option value="">— выберите —</option>
                        {(products || []).map(pr => <option key={pr.id} value={pr.id}>{pr.skuCode} · {pr.name} (ост. {pr.currentStock})</option>)}
                      </Select>
                      {p && num(it.qty) > num(p.currentStock) && <div style={{ color: '#dc2626', fontSize: 11, marginTop: 2 }}>⚠ на складе {p.currentStock}</div>}
                    </td>
                    <td><Input type="number" min={1} value={it.qty} onChange={e => setItemField(i, 'qty', e.target.value)} style={{ padding: '4px 6px', textAlign: 'center' }} /></td>
                    <td><Input type="number" min={0} value={it.price} onChange={e => setItemField(i, 'price', e.target.value)} style={{ padding: '4px 6px', textAlign: 'right' }} /></td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(num(it.qty) * num(it.price))}</td>
                    <td style={{ textAlign: 'center' }}><button type="button" className="erp-icon-btn" style={{ color: '#dc2626' }} onClick={() => removeItem(i)} title="Убрать">✕</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Button variant="outline" onClick={addItem} style={{ marginTop: 8, fontSize: 12 }}>➕ Добавить товар</Button>
          <div style={{ textAlign: 'right', marginTop: 8, fontSize: 15 }}>Итого: <b>{fmt(formTotal)} ₸</b></div>
        </Field>

        {/* Смешанная оплата — только при создании/клонировании */}
        {!form.id && (
          <div className="sale-pay">
            <div className="sale-pay-h">
              <b>💳 Оплата</b>
              {formStatus === 'Оплачено' ? <Badge tone="ok">Оплачено</Badge>
                : formStatus === 'Частично' ? <Badge tone="warn">Частично · {fmt(allocated)} из {fmt(formTotal)}</Badge>
                : <Badge tone="warn">Ожидает</Badge>}
            </div>
            {form.payments.map((p, i) => (
              <div className="sale-pay-row" key={i}>
                <Select value={p.accountId} onChange={e => setPayAccount(i, e.target.value)}>
                  <option value="">— выберите счёт —</option>
                  {saleAccounts.map(a => <option key={a.id} value={a.id}>{a.icon || '💳'} {a.name}</option>)}
                </Select>
                <Input type="number" min={0} value={p.amount} onChange={e => setPayAmount(i, e.target.value)} placeholder="сумма" style={{ textAlign: 'right' }} />
                <button type="button" className="erp-icon-btn" style={{ color: '#dc2626' }} onClick={() => removePay(i)} title="Убрать">✕</button>
              </div>
            ))}
            <Button variant="outline" onClick={addPay} style={{ fontSize: 12 }}>+ Добавить счёт</Button>
            <div className="sale-pay-state">
              <span>Распределено: <b style={{ color: '#16a34a' }}>{fmt(allocated)}</b></span>
              <span>Осталось: <b style={{ color: remaining > 0 ? '#b45309' : '#16a34a' }}>{fmt(remaining)} ₸{remaining > 0 ? ` — будет «${formStatus}»` : ''}</b></span>
            </div>
            <div className="erp-muted" style={{ fontSize: 11, marginTop: 6 }}>Счёт по умолчанию пуст. Всё одним счётом — одна строка на полную сумму; часть Каспи + часть наличкой — две строки. Недораспределённый остаток = долг (статус «Частично»/«Ожидает»), закрыть можно кнопкой «💵 Дооплата». Каждая строка = свой приход в Финансах (раздел «Продажа»).</div>
          </div>
        )}
        {form.id && <div className="erp-muted" style={{ fontSize: 12, marginTop: 8 }}>💳 Оплаты правятся отдельно — кнопкой «💵 Дооплата» в журнале.</div>}

        <div className="erp-form-row" style={{ marginTop: 12 }}>
          <Field label="Дата"><Input type="date" value={form.saleDate} onChange={e => setForm(f => ({ ...f, saleDate: e.target.value }))} /></Field>
          <Field label="Комментарий"><Input value={form.comment} onChange={e => setForm(f => ({ ...f, comment: e.target.value }))} placeholder="необязательно" /></Field>
        </div>
      </Modal>

      {/* ── Дооплата ── */}
      <Modal open={topup.open} onClose={() => setTopup({ open: false, sale: null, rows: [emptyPay()], err: '', saving: false })} title={`💵 Дооплата — ${topup.sale?.saleNo || ''}`} width={520}
        footer={<><Button onClick={confirmTopup} disabled={topup.saving}>{topup.saving ? 'Проведение…' : 'Провести дооплату'}</Button><Button variant="outline" onClick={() => setTopup({ open: false, sale: null, rows: [emptyPay()], err: '', saving: false })}>Отмена</Button></>}>
        {topup.err && <div className="erp-form-err">{topup.err}</div>}
        <div className="erp-muted" style={{ fontSize: 13, marginBottom: 8 }}>Итого {fmt(topup.sale?.totalSum || 0)} ₸ · оплачено {fmt(topup.sale?.paidSum || 0)} ₸ · <b>остаток {fmt(topupRemaining)} ₸</b></div>
        {topup.rows.map((p, i) => (
          <div className="sale-pay-row" key={i}>
            <Select value={p.accountId} onChange={e => setTopupAccount(i, e.target.value)}>
              <option value="">— выберите счёт —</option>
              {saleAccounts.map(a => <option key={a.id} value={a.id}>{a.icon || '💳'} {a.name}</option>)}
            </Select>
            <Input type="number" min={0} value={p.amount} onChange={e => setTopup(t => ({ ...t, rows: t.rows.map((r, j) => j === i ? { ...r, amount: e.target.value } : r) }))} placeholder="сумма" style={{ textAlign: 'right' }} />
            <button type="button" className="erp-icon-btn" style={{ color: '#dc2626' }} onClick={() => setTopup(t => ({ ...t, rows: t.rows.length > 1 ? t.rows.filter((_, j) => j !== i) : [emptyPay()] }))} title="Убрать">✕</button>
          </div>
        ))}
        <Button variant="outline" onClick={() => setTopup(t => ({ ...t, rows: [...t.rows, emptyPay()] }))} style={{ fontSize: 12 }}>+ Добавить счёт</Button>
        <div className="sale-pay-state"><span>К доплате: <b style={{ color: '#16a34a' }}>{fmt(topupTotal)}</b></span><span>Останется: <b>{fmt(Math.max(0, topupRemaining - topupTotal))} ₸</b></span></div>
      </Modal>

      <Modal open={!!histSale} onClose={() => setHistSale(null)} title={`Продажа ${histSale?.saleNo || ''}`}
        footer={<Button variant="outline" onClick={() => setHistSale(null)}>Закрыть</Button>}>
        {histSale && <EntityHistory entityType="sale" entityId={histSale.id} />}
      </Modal>
    </div>
  );
}
