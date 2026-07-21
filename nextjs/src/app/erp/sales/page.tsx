'use client';
import * as React from 'react';
import { useApi, apiSend } from '@/lib/api';
import { toast } from '@/lib/toast';
import { Card, Badge, Button, PageTitle, Modal, Field, Input, Select, EmptyRow } from '@/components/ui';
import EntityHistory from '@/components/erp/EntityHistory';

type SaleItem = { productId: string; productName?: string | null; skuCode?: string | null; qty: number; price: number; sum: number };
type Sale = { id: string; saleNo?: string | null; saleDate?: string | null; clientName?: string | null; clientType?: string | null; productName?: string | null; skuCode?: string | null; qty?: number; price?: string | number; totalSum?: string | number; payStatus?: string | null; invoiceType?: string | null; items?: SaleItem[] | null; comment?: string | null; cancelledAt?: string | null; createdByName?: string | null };
type Client = { id: string; name: string };
type Product = { id: string; skuCode: string; name: string; price: string | number; priceDiscount?: string | number | null; currentStock: number };
type Acct = { id: string; name: string; section?: string | null; icon?: string | null };
type FormItem = { productId: string; productName: string; skuCode: string; qty: string; price: string };

const num = (v: unknown) => Number(v) || 0;
const fmt = (n: number | string) => (Number(n) || 0).toLocaleString('ru-RU');
const dmy = (d?: string | null) => (d ? String(d).slice(0, 10).split('-').reverse().join('.') : '');
const iso = (d?: string | null) => (d ? String(d).slice(0, 10) : '');
const today = () => new Date().toISOString().slice(0, 10);
const CLIENT_TYPES: Array<[string, string]> = [['retail', '🛒 Покупатель'], ['client', '🤝 Клиент (скидка)']];
const clientTypeLabel = (t?: string | null) => (t === 'client' ? 'Клиент' : 'Покупатель');
function priceFor(p: Product | undefined, ct: string): number {
  if (!p) return 0;
  if (ct === 'client') { const d = num(p.priceDiscount); return d > 0 ? d : num(p.price); }
  return num(p.price);
}
const emptyItem = (): FormItem => ({ productId: '', productName: '', skuCode: '', qty: '1', price: '' });
const emptyForm = () => ({ id: '', clientName: '', clientType: 'retail', payStatus: 'Оплачено', accountId: '', saleDate: today(), comment: '', items: [emptyItem()] });

export default function SalesPage() {
  const { data: sales, error, isLoading, mutate } = useApi<Sale[]>('/api/v2/sales');
  const { data: clients } = useApi<Client[]>('/api/v2/clients');
  const { data: products } = useApi<Product[]>('/api/v2/products');
  const { data: fin } = useApi<{ accounts: Acct[] }>('/api/v2/finance');
  const { data: session } = useApi<{ user?: { role?: string } }>('/api/auth/session');
  const canCancel = ['admin', 'accountant'].includes(session?.user?.role || '');
  const saleAccounts = (fin?.accounts || []).filter(a => (a.section || '') === 'sale');
  const acctName = (id: string) => saleAccounts.find(a => a.id === id)?.name || null;

  const [modal, setModal] = React.useState(false);
  const [form, setForm] = React.useState(emptyForm());
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState('');
  const [histSale, setHistSale] = React.useState<Sale | null>(null);
  const [pay, setPay] = React.useState<{ open: boolean; sale: Sale | null; accountId: string }>({ open: false, sale: null, accountId: '' });

  const list = sales || [];
  const active = list.filter(x => !x.cancelledAt);
  const total = active.reduce((s, x) => s + num(x.totalSum), 0);
  const paidSum = active.filter(x => x.payStatus === 'Оплачено').reduce((s, x) => s + num(x.totalSum), 0);
  const pendingSum = total - paidSum;

  // ── форма позиций ──
  const formTotal = form.items.reduce((s, it) => s + num(it.qty) * num(it.price), 0);
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

  function openNew() { setForm({ ...emptyForm(), accountId: saleAccounts[0]?.id || '' }); setErr(''); setModal(true); }
  function openEdit(s: Sale) {
    const its: FormItem[] = (s.items && s.items.length)
      ? s.items.map(i => ({ productId: i.productId, productName: i.productName || '', skuCode: i.skuCode || '', qty: String(i.qty), price: String(i.price) }))
      : [emptyItem()];
    setForm({ id: s.id, clientName: s.clientName || '', clientType: s.clientType || 'retail', payStatus: s.payStatus || 'В ожидании', accountId: '', saleDate: iso(s.saleDate) || today(), comment: s.comment || '', items: its });
    setErr(''); setModal(true);
  }

  async function save() {
    if (!form.clientName.trim()) { setErr('Укажите клиента'); return; }
    const items = form.items.filter(it => it.productId && num(it.qty) > 0).map(it => ({ productId: it.productId, productName: it.productName, skuCode: it.skuCode, qty: num(it.qty), price: num(it.price) }));
    if (!items.length) { setErr('Добавьте хотя бы одну позицию со складом'); return; }
    if (form.payStatus === 'Оплачено' && !form.id && !form.accountId) { setErr('Выберите счёт зачисления'); return; }
    setSaving(true); setErr('');
    const body: Record<string, unknown> = { clientName: form.clientName.trim(), clientType: form.clientType, items, payStatus: form.payStatus, saleDate: form.saleDate || null, comment: form.comment || null };
    if (form.payStatus === 'Оплачено' && form.accountId) { body.accountId = form.accountId; body.invoiceType = acctName(form.accountId); }
    try {
      if (form.id) await apiSend(`/api/v2/sales/${form.id}`, 'PATCH', body);
      else await apiSend('/api/v2/sales', 'POST', body);
      setModal(false); await mutate();
      toast(form.id ? '✅ Продажа обновлена' : (form.payStatus === 'Оплачено' ? '✅ Продажа: приход в финансы + списан склад' : '✅ Продажа записана'));
    } catch (e) { setErr((e as Error).message); } finally { setSaving(false); }
  }

  // ── инлайн-переключение оплаты ──
  function openPay(s: Sale) { setPay({ open: true, sale: s, accountId: saleAccounts[0]?.id || '' }); }
  async function confirmPay() {
    if (!pay.sale) return;
    if (!pay.accountId) { toast('⚠️ Выберите счёт'); return; }
    try {
      await apiSend(`/api/v2/sales/${pay.sale.id}`, 'PATCH', { payStatus: 'Оплачено', accountId: pay.accountId, invoiceType: acctName(pay.accountId) });
      setPay({ open: false, sale: null, accountId: '' }); await mutate(); toast('✓ Отмечено оплачено — приход в финансы');
    } catch (e) { toast('⚠️ ' + (e as Error).message); }
  }
  async function markUnpaid(s: Sale) {
    if (!confirm(`Снять отметку оплаты с ${s.saleNo}?\nПриход в финансах будет сторнирован.`)) return;
    try { await apiSend(`/api/v2/sales/${s.id}`, 'PATCH', { payStatus: 'В ожидании' }); await mutate(); toast('↩ Оплата снята: приход сторнирован'); }
    catch (e) { toast('⚠️ ' + (e as Error).message); }
  }
  async function cancelSale(s: Sale) {
    if (!confirm(`Отменить продажу ${s.saleNo}?\n\nПриход сторнируется, остаток вернётся на склад. Продажа останется в журнале как «Отменена».`)) return;
    try { await apiSend(`/api/v2/sales/${s.id}/cancel`, 'POST'); await mutate(); toast('↩️ Продажа отменена: сторно + возврат склада'); }
    catch (e) { toast('⚠️ ' + (e as Error).message); }
  }

  // ── экспорт ──
  async function exportWord() {
    const rows = active.map(s => [s.saleNo || '', dmy(s.saleDate), s.clientName || '', clientTypeLabel(s.clientType), s.productName || '', fmt(s.qty || 0), fmt(s.totalSum || 0), s.payStatus === 'Оплачено' ? 'Оплачено' : 'Ожидает', s.invoiceType || '']);
    const spec = {
      titleLines: ['Журнал продаж'], subtitle: `Продаж: ${active.length} · на ${fmt(total)} ₸`, orientation: 'landscape',
      columns: [{ header: '№', width: 8 }, { header: 'Дата', width: 10 }, { header: 'Клиент', width: 20, align: 'left' }, { header: 'Тип', width: 10 }, { header: 'Товар', width: 22, align: 'left' }, { header: 'Кол-во', width: 8, align: 'right' }, { header: 'Сумма', width: 12, align: 'right' }, { header: 'Оплата', width: 10 }, { header: 'Счёт', width: 10 }],
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
    const rows = active.map(s => `<tr><td>${s.saleNo || ''}</td><td>${dmy(s.saleDate)}</td><td style="text-align:left">${s.clientName || ''}</td><td>${clientTypeLabel(s.clientType)}</td><td style="text-align:left">${s.productName || ''}</td><td>${fmt(s.qty || 0)}</td><td style="text-align:right">${fmt(s.totalSum || 0)} ₸</td><td>${s.payStatus === 'Оплачено' ? 'Оплачено' : 'Ожидает'}</td></tr>`).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Журнал продаж</title><style>@page{size:A4 landscape;margin:12mm}body{font-family:'Times New Roman',serif;font-size:12px}h2{text-align:center;margin:0 0 4px}table{width:100%;border-collapse:collapse;margin-top:8px}td,th{border:1px solid #000;padding:4px;text-align:center}</style></head><body><h2>Журнал продаж</h2><div style="text-align:center;margin-bottom:6px">Продаж: ${active.length} · на ${fmt(total)} ₸</div><table><thead><tr><th>№</th><th>Дата</th><th>Клиент</th><th>Тип</th><th>Товар</th><th>Кол-во</th><th>Сумма</th><th>Оплата</th></tr></thead><tbody>${rows}</tbody></table><script>window.onload=()=>window.print()<\/script></body></html>`;
    const b = new Blob([html], { type: 'text/html' }); const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(b), target: '_blank' }); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

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
                  const paidS = s.payStatus === 'Оплачено';
                  return (
                    <tr key={s.id} style={cancelled ? { opacity: 0.55 } : undefined}>
                      <td className="erp-muted" style={{ fontSize: 12 }}>{s.saleNo}</td>
                      <td className="erp-muted" style={{ fontSize: 12 }}>{dmy(s.saleDate)}</td>
                      <td className="erp-td-main">{s.clientName || '—'}</td>
                      <td><Badge tone={s.clientType === 'client' ? 'info' : 'neutral'}>{s.clientType === 'client' ? '🤝 Клиент' : '🛒 Покупатель'}</Badge></td>
                      <td style={cancelled ? { textDecoration: 'line-through' } : undefined}>{s.productName || '—'} {s.skuCode && <span className="erp-muted" style={{ fontSize: 11 }}>{s.skuCode}</span>}</td>
                      <td style={{ textAlign: 'right' }}>{fmt(s.qty || 0)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, ...(cancelled ? { textDecoration: 'line-through' } : {}) }}>{fmt(s.totalSum || 0)} ₸</td>
                      <td>{cancelled ? <Badge tone="err">✕ Отменена</Badge> : <Badge tone={paidS ? 'ok' : 'warn'}>{paidS ? '✓ Оплачено' : '⏳ Ожидает'}</Badge>}</td>
                      <td className="erp-muted" style={{ fontSize: 12 }}>{s.invoiceType || '—'}</td>
                      <td className="erp-muted" style={{ fontSize: 12 }}>{s.createdByName || '—'}</td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {!cancelled && (paidS
                          ? <button className="erp-icon-btn" title="Снять оплату (сторно)" onClick={() => markUnpaid(s)}>↩</button>
                          : <button className="erp-icon-btn" title="Отметить оплаченной" style={{ color: '#16a34a' }} onClick={() => openPay(s)}>✓</button>)}
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

      {/* ── Модалка продажи (мультипозиция) ── */}
      <Modal open={modal} onClose={() => setModal(false)} title={form.id ? '✏️ Продажа' : '➕ Новая продажа'} width={680}
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

        <div className="erp-form-row">
          <Field label="Дата"><Input type="date" value={form.saleDate} onChange={e => setForm(f => ({ ...f, saleDate: e.target.value }))} /></Field>
          <Field label="Оплата"><Select value={form.payStatus} onChange={e => setForm(f => ({ ...f, payStatus: e.target.value }))}><option>Оплачено</option><option>В ожидании</option></Select></Field>
        </div>
        {form.payStatus === 'Оплачено' && (
          <Field label="Счёт зачисления (раздел «Продажа»)">
            <Select value={form.accountId} onChange={e => setForm(f => ({ ...f, accountId: e.target.value }))}>
              <option value="">{form.id ? '— оставить прежний счёт —' : '— выберите счёт —'}</option>
              {saleAccounts.map(a => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
            </Select>
            <div className="erp-muted" style={{ fontSize: 11, marginTop: 4 }}>При «Оплачено» создаётся приход в Финансах и списывается остаток со склада.</div>
          </Field>
        )}
        <Field label="Комментарий"><Input value={form.comment} onChange={e => setForm(f => ({ ...f, comment: e.target.value }))} /></Field>
      </Modal>

      {/* ── Инлайн-оплата: выбор счёта ── */}
      <Modal open={pay.open} onClose={() => setPay({ open: false, sale: null, accountId: '' })} title={`✓ Оплата — ${pay.sale?.saleNo || ''}`}
        footer={<><Button onClick={confirmPay}>Провести приход</Button><Button variant="outline" onClick={() => setPay({ open: false, sale: null, accountId: '' })}>Отмена</Button></>}>
        <Field label="Счёт зачисления" required>
          <Select value={pay.accountId} onChange={e => setPay(p => ({ ...p, accountId: e.target.value }))}>
            <option value="">— выберите счёт —</option>
            {saleAccounts.map(a => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
          </Select>
        </Field>
        <div className="erp-muted" style={{ fontSize: 12 }}>Сумма {fmt(pay.sale?.totalSum || 0)} ₸ поступит приходом в Финансы (раздел «Продажа»).</div>
      </Modal>

      <Modal open={!!histSale} onClose={() => setHistSale(null)} title={`Продажа ${histSale?.saleNo || ''}`}
        footer={<Button variant="outline" onClick={() => setHistSale(null)}>Закрыть</Button>}>
        {histSale && <EntityHistory entityType="sale" entityId={histSale.id} />}
      </Modal>
    </div>
  );
}
