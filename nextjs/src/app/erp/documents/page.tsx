'use client';
import * as React from 'react';
import { formatDate } from '@/lib/format';
import { useApi, apiFetch, apiSend } from '@/lib/api';
import { toast } from '@/lib/toast';
import { Card, Button, PageTitle, Modal, Field, Input, Select, EmptyRow } from '@/components/ui';
import { amountInWordsKzt } from '@/server/dto/documents.dto';
import EntityHistory from '@/components/erp/EntityHistory';

type Doc = { id: string; type: string; number: number; docNo?: string | null; docDate?: string | null; buyerName?: string | null; total?: string | number | null; bank?: string | null; createdByName?: string | null };
type Client = { id: string; name: string };
type Product = { id: string; skuCode: string; name: string; price: string | number };
type Org = { banks?: { key: string; name: string; iik?: string }[] | null };
type Item = { name: string; sku?: string | null; qty: number; unit: string; price: number };

const TYPES = [
  { key: 'invoice', icon: '🧾', label: 'Счёт на оплату', sub: 'Каспи / БЦК · сумма прописью' },
  { key: 'nakladnaya', icon: '📦', label: 'Накладная (З-2)', sub: 'официальная форма' },
  { key: 'akt', icon: '📝', label: 'Акт (Р-1)', sub: 'выполненных работ' },
  { key: 'kp', icon: '📄', label: 'КП', sub: 'коммерческое предложение' },
];
const TLABEL: Record<string, string> = { invoice: '🧾 Счёт', nakladnaya: '📦 Накладная', akt: '📝 Акт', kp: '📄 КП' };
const fmt = (n: number | string) => (Number(n) || 0).toLocaleString('ru-RU') + ' ₸';
const dmy = (d?: string | null) => formatDate(d) || '—';
const today = () => new Date().toISOString().slice(0, 10);

export default function DocumentsPage() {
  const { data: docs, mutate } = useApi<Doc[]>('/api/v2/documents');
  const { data: clients } = useApi<Client[]>('/api/v2/clients');
  const { data: products } = useApi<Product[]>('/api/v2/products');
  const { data: org } = useApi<Org>('/api/v2/org');
  const banks = org?.banks || [];

  const [type, setType] = React.useState('invoice');
  const [modal, setModal] = React.useState(false);
  const [num, setNum] = React.useState('');
  const [f, setF] = React.useState({ buyerName: '', buyerBin: '', buyerAddress: '', bank: 'kaspi', date: today(), withStamp: false, withSign: false });
  const [items, setItems] = React.useState<Item[]>([]);
  const [prodQ, setProdQ] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState('');
  const [histDoc, setHistDoc] = React.useState<Doc | null>(null);

  const total = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.price) || 0), 0);
  const list = docs || [];

  async function open(t: string) {
    setType(t); setF({ buyerName: '', buyerBin: '', buyerAddress: '', bank: banks[0]?.key || 'kaspi', date: today(), withStamp: false, withSign: false });
    setItems([]); setProdQ(''); setErr(''); setModal(true);
    try { const j = await apiFetch<{ number: number }>('/api/v2/documents?next=' + t); setNum('№ ' + j.number); } catch { setNum(''); }
  }
  const prodHits = prodQ.trim() ? (products || []).filter(p => (p.name + ' ' + p.skuCode).toLowerCase().includes(prodQ.toLowerCase())).slice(0, 6) : [];

  async function save() {
    if (!f.buyerName.trim()) { setErr('Укажите покупателя'); return; }
    const good = items.filter(it => it.name.trim() && (Number(it.qty) || 0) > 0);
    if (!good.length) { setErr('Добавьте позицию'); return; }
    setSaving(true); setErr('');
    try {
      await apiSend('/api/v2/documents', 'POST', { type, docDate: f.date, buyerName: f.buyerName.trim(), buyerBin: f.buyerBin || null, buyerAddress: f.buyerAddress || null, bank: type === 'invoice' ? f.bank : null, items: good.map(it => ({ name: it.name, sku: it.sku || null, qty: Number(it.qty) || 0, unit: it.unit || 'шт', price: Number(it.price) || 0 })), withStamp: f.withStamp, withSign: f.withSign });
      setModal(false); await mutate(); toast('✅ Документ создан');
    } catch (e) { setErr((e as Error).message); } finally { setSaving(false); }
  }
  function download(id: string, fmtType: string) { const a = Object.assign(document.createElement('a'), { href: `/api/v2/documents/${id}/file?fmt=${fmtType}` }); document.body.appendChild(a); a.click(); a.remove(); }
  async function del(d: Doc) { if (!confirm('Удалить документ?')) return; try { await apiSend(`/api/v2/documents/${d.id}`, 'DELETE'); await mutate(); toast('🗑️ Удалено'); } catch (e) { toast('⚠️ ' + (e as Error).message); } }
  async function print(id: string) {
    const d = await apiFetch<Record<string, unknown>>(`/api/v2/documents/${id}`);
    const o = org || {};
    const its = (d.items as Item[] & { sum?: number }[]) || [];
    const rows = its.map((it, i) => `<tr><td>${i + 1}</td><td style="text-align:left">${it.name || ''}</td><td>${it.qty}</td><td>${it.unit || 'шт'}</td><td style="text-align:right">${fmt(it.price)}</td><td style="text-align:right">${fmt((it as { sum?: number }).sum ?? (Number(it.qty) * Number(it.price)))}</td></tr>`).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${d.docNo || 'Документ'}</title><style>@page{size:A4;margin:14mm}body{font-family:'Times New Roman',serif;font-size:12px}h2{text-align:center}table{width:100%;border-collapse:collapse}td,th{border:1px solid #000;padding:4px;text-align:center}</style></head><body><h2>${d.docNo || ''} от ${dmy(d.docDate as string)} г.</h2><div><b>Поставщик:</b> ТОО «VERTEX SERVICE»</div><div style="margin-bottom:8px"><b>Покупатель:</b> ${d.buyerName || ''}${d.buyerBin ? ', БИН ' + d.buyerBin : ''}</div><table><thead><tr><th>№</th><th>Наименование</th><th>Кол-во</th><th>Ед.</th><th>Цена</th><th>Сумма</th></tr></thead><tbody>${rows}</tbody></table><div style="margin-top:6px"><b>Итого:</b> ${fmt(d.total as number)} · <b>${d.amountWords || ''}</b></div><div style="position:relative;margin-top:36px"><b>Исполнитель</b> _____________ ${d.withSign && (o as { signB64?: string }).signB64 ? `<img src="${(o as { signB64?: string }).signB64}" style="position:absolute;width:100px;left:96px;top:-8px">` : ''}${d.withStamp && (o as { stampB64?: string }).stampB64 ? `<img src="${(o as { stampB64?: string }).stampB64}" style="position:absolute;width:110px;left:180px;top:-30px;transform:rotate(-8deg)">` : ''} / М.Молдабаев /</div><script>window.onload=()=>window.print()<\/script></body></html>`;
    const b = new Blob([html], { type: 'text/html' }); const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(b), target: '_blank' }); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  return (
    <div>
      <PageTitle title="Документы" sub="Счета, накладные, акты и КП по шаблонам компании" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 12, marginBottom: 18 }}>
        {TYPES.map(t => <div key={t.key} className="ui-card" style={{ cursor: 'pointer' }} onClick={() => open(t.key)}><div style={{ fontSize: 28 }}>{t.icon}</div><div style={{ fontWeight: 700, marginTop: 6 }}>{t.label}</div><div className="erp-muted" style={{ fontSize: 11 }}>{t.sub}</div></div>)}
      </div>

      <Card style={{ padding: 0 }}>
        {list.length === 0 ? <EmptyRow>Пока нет документов. Нажмите на карточку выше.</EmptyRow> : (
          <table className="erp-table">
            <thead><tr><th>Тип</th><th>Номер</th><th>Дата</th><th>Покупатель</th><th style={{ textAlign: 'right' }}>Сумма</th><th>Автор</th><th style={{ textAlign: 'right' }}>Действия</th></tr></thead>
            <tbody>
              {list.map(d => (
                <tr key={d.id}>
                  <td>{TLABEL[d.type] || d.type}</td><td className="erp-muted" style={{ fontSize: 12 }}>{d.docNo}</td><td className="erp-muted" style={{ fontSize: 12 }}>{dmy(d.docDate)}</td>
                  <td className="erp-td-main">{d.buyerName}</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(d.total || 0)}</td>
                  <td className="erp-muted" style={{ fontSize: 12 }}>{d.createdByName || '—'}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="erp-icon-btn" title="История" onClick={() => setHistDoc(d)}>🕘</button>
                    <button className="erp-icon-btn" title="Excel" onClick={() => download(d.id, 'excel')}>⬇xls</button>
                    <button className="erp-icon-btn" title="Word" onClick={() => download(d.id, 'word')}>⬇doc</button>
                    <button className="erp-icon-btn" title="PDF / печать" onClick={() => print(d.id)}>🖨</button>
                    <button className="erp-icon-btn" title="Удалить" style={{ color: '#dc2626' }} onClick={() => del(d)}>🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal open={modal} onClose={() => setModal(false)} title={`➕ ${TYPES.find(t => t.key === type)?.label}`} width={640}
        footer={<><Button onClick={save} disabled={saving}>{saving ? '…' : 'Создать документ'}</Button><Button variant="outline" onClick={() => setModal(false)}>Отмена</Button></>}>
        {err && <div className="erp-form-err">{err}</div>}
        <div className="erp-form-row">
          <Field label="Номер"><Input value={num} readOnly /></Field>
          <Field label="Дата"><Input type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></Field>
        </div>
        {type === 'invoice' && <Field label="Банк (счёт получателя)"><Select value={f.bank} onChange={e => setF({ ...f, bank: e.target.value })}>{banks.map(b => <option key={b.key} value={b.key}>{b.name} · {b.iik}</option>)}</Select></Field>}
        <Field label="Покупатель" required>
          <Select value="" onChange={e => { const c = (clients || []).find(x => x.id === e.target.value); if (c) setF(s => ({ ...s, buyerName: c.name })); }}><option value="">— из клиентов или впишите —</option>{(clients || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
          <Input value={f.buyerName} onChange={e => setF({ ...f, buyerName: e.target.value })} placeholder="название / ФИО" style={{ marginTop: 6 }} />
        </Field>
        <div className="erp-form-row"><Field label="БИН / ИИН"><Input value={f.buyerBin} onChange={e => setF({ ...f, buyerBin: e.target.value })} /></Field><Field label="Адрес"><Input value={f.buyerAddress} onChange={e => setF({ ...f, buyerAddress: e.target.value })} /></Field></div>
        <div style={{ position: 'relative', margin: '8px 0' }}>
          <Input placeholder="🔍 Товар со склада" value={prodQ} onChange={e => setProdQ(e.target.value)} />
          {prodHits.length > 0 && <div style={{ position: 'absolute', zIndex: 20, left: 0, right: 0, background: '#fff', border: '1px solid #d1d5db', borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,.12)' }}>{prodHits.map(p => <div key={p.id} style={{ padding: 8, cursor: 'pointer', fontSize: 12 }} onClick={() => { setItems([...items, { name: p.name, sku: p.skuCode, qty: 1, unit: 'шт', price: Number(p.price) || 0 }]); setProdQ(''); }}><b>{p.name}</b> · {p.skuCode} · {fmt(p.price)}</div>)}</div>}
        </div>
        <table className="erp-table" style={{ fontSize: 12 }}><thead><tr><th>Наименование</th><th style={{ width: 60 }}>Кол-во</th><th style={{ width: 90 }}>Цена</th><th style={{ width: 90 }}>Сумма</th><th style={{ width: 30 }}></th></tr></thead>
          <tbody>{items.map((it, i) => <tr key={i}>
            <td><Input value={it.name} onChange={e => { const n = [...items]; n[i] = { ...it, name: e.target.value }; setItems(n); }} style={{ padding: '4px 6px' }} /></td>
            <td><Input type="number" value={String(it.qty)} onChange={e => { const n = [...items]; n[i] = { ...it, qty: Number(e.target.value) || 0 }; setItems(n); }} style={{ padding: 4, textAlign: 'center' }} /></td>
            <td><Input type="number" value={String(it.price)} onChange={e => { const n = [...items]; n[i] = { ...it, price: Number(e.target.value) || 0 }; setItems(n); }} style={{ padding: 4, textAlign: 'right' }} /></td>
            <td style={{ textAlign: 'right' }}>{fmt((Number(it.qty) || 0) * (Number(it.price) || 0))}</td>
            <td style={{ textAlign: 'center' }}><button className="erp-icon-btn" style={{ color: '#dc2626' }} onClick={() => setItems(items.filter((_, j) => j !== i))}>✕</button></td>
          </tr>)}</tbody>
        </table>
        <Button variant="outline" onClick={() => setItems([...items, { name: '', qty: 1, unit: 'шт', price: 0 }])} style={{ marginTop: 8, fontSize: 12 }}>+ Строка</Button>
        <div style={{ textAlign: 'right', marginTop: 10, fontSize: 15 }}>Итого: <b>{fmt(total)}</b></div>
        {total > 0 && <div style={{ textAlign: 'right', fontSize: 12, color: '#6b7280', fontStyle: 'italic' }}>{amountInWordsKzt(total)}</div>}
        <div style={{ display: 'flex', gap: 20, marginTop: 12, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
          <label style={{ fontSize: 13, cursor: 'pointer' }}><input type="checkbox" checked={f.withStamp} onChange={e => setF({ ...f, withStamp: e.target.checked })} /> 🔵 Печать</label>
          <label style={{ fontSize: 13, cursor: 'pointer' }}><input type="checkbox" checked={f.withSign} onChange={e => setF({ ...f, withSign: e.target.checked })} /> ✍ Подпись</label>
        </div>
      </Modal>

      <Modal open={!!histDoc} onClose={() => setHistDoc(null)} title={`Документ ${histDoc?.docNo || ''}`}
        footer={<Button variant="outline" onClick={() => setHistDoc(null)}>Закрыть</Button>}>
        {histDoc && <EntityHistory entityType="document" entityId={histDoc.id} />}
      </Modal>
    </div>
  );
}
