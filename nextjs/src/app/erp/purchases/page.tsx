'use client';
import * as React from 'react';
import { useApi, apiSend } from '@/lib/api';
import { toast } from '@/lib/toast';
import { Card, Button, PageTitle, Modal, Field, Input, Select, EmptyRow } from '@/components/ui';

type Movement = { id: string; skuCode?: string | null; productName?: string | null; qty: number; price?: string | number; totalSum?: string | number; supplier?: string | null; docNo?: string | null; author?: string | null; moveDate?: string | null };
type Product = { id: string; skuCode: string; name: string; price: string | number; currentStock: number };

const num = (v: unknown) => Number(v) || 0;
const fmt = (n: number | string) => (Number(n) || 0).toLocaleString('ru-RU');
const dmy = (d?: string | null) => (d ? String(d).slice(0, 10).split('-').reverse().join('.') : '');
const today = () => new Date().toISOString().slice(0, 10);

export default function PurchasesPage() {
  const { data: buys, error, isLoading, mutate } = useApi<Movement[]>('/api/v2/products/movements?type=IN&limit=200');
  const { data: products } = useApi<Product[]>('/api/v2/products');
  const [q, setQ] = React.useState('');
  const [f, setF] = React.useState({ open: false, productId: '', qty: '1', price: '', supplier: '', docNo: '', date: today(), err: '', saving: false });

  const list = (buys || []).filter(b => !q.trim() || (`${b.productName} ${b.skuCode} ${b.supplier || ''}`).toLowerCase().includes(q.toLowerCase()));
  const totalSum = (buys || []).reduce((s, b) => s + num(b.totalSum), 0);

  function openNew() { setF({ open: true, productId: '', qty: '1', price: '', supplier: '', docNo: '', date: today(), err: '', saving: false }); }
  async function save() {
    const p = (products || []).find(x => x.id === f.productId);
    if (!p) { setF(s => ({ ...s, err: 'Выберите товар' })); return; }
    if (num(f.qty) <= 0) { setF(s => ({ ...s, err: 'Количество больше 0' })); return; }
    setF(s => ({ ...s, saving: true, err: '' }));
    try {
      await apiSend('/api/v2/products', 'POST', { productId: f.productId, moveType: 'IN', qty: num(f.qty), price: num(f.price), supplier: f.supplier || null, docNo: f.docNo || null, moveDate: f.date || null, comment: 'Закупка' });
      setF(s => ({ ...s, open: false })); await mutate(); toast('📥 Закупка проведена — товар на складе');
    } catch (e) { setF(s => ({ ...s, err: (e as Error).message, saving: false })); }
  }

  return (
    <div>
      <PageTitle title="Закупки" sub="Приход товара от поставщиков (журнал закупок)" action={<Button onClick={openNew}>+ Новая закупка</Button>} />

      <div className="erp-kpi-grid">
        <div className="erp-kpi"><div className="erp-kpi-top"><span className="erp-kpi-ico">🛒</span><span className="erp-kpi-label">Закупок</span></div><div className="erp-kpi-val">{(buys || []).length}</div></div>
        <div className="erp-kpi"><div className="erp-kpi-top"><span className="erp-kpi-ico">💰</span><span className="erp-kpi-label">Сумма закупок</span></div><div className="erp-kpi-val">{fmt(totalSum)} ₸</div></div>
      </div>

      <Card className="erp-filters" style={{ marginTop: 12 }}><Input placeholder="🔍 Товар, SKU или поставщик" value={q} onChange={e => setQ(e.target.value)} /></Card>

      <Card style={{ marginTop: 12, padding: 0, overflowX: 'auto' }}>
        {error ? <EmptyRow>Нет доступа к закупкам.</EmptyRow> : isLoading ? <EmptyRow>Загрузка…</EmptyRow>
          : list.length === 0 ? <EmptyRow>Закупок пока нет. Нажмите «+ Новая закупка».</EmptyRow>
          : (
            <table className="erp-table">
              <thead><tr><th>Дата</th><th>Поставщик</th><th>Товар</th><th style={{ textAlign: 'right' }}>Кол-во</th><th style={{ textAlign: 'right' }}>Цена</th><th style={{ textAlign: 'right' }}>Сумма</th><th>Документ</th><th>Автор</th></tr></thead>
              <tbody>
                {list.map(b => (
                  <tr key={b.id}>
                    <td className="erp-muted" style={{ fontSize: 12 }}>{dmy(b.moveDate)}</td>
                    <td className="erp-td-main">{b.supplier || '—'}</td>
                    <td>{b.productName} <span className="erp-muted" style={{ fontSize: 11 }}>{b.skuCode}</span></td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(b.qty)}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(b.price || 0)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{num(b.totalSum) ? fmt(b.totalSum!) + ' ₸' : '—'}</td>
                    <td style={{ fontSize: 12 }}>{b.docNo || '—'}</td>
                    <td className="erp-muted" style={{ fontSize: 12 }}>{b.author || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </Card>

      <Modal open={f.open} onClose={() => setF(s => ({ ...s, open: false }))} title="📥 Новая закупка" width={520}
        footer={<><Button onClick={save} disabled={f.saving}>{f.saving ? 'Сохранение…' : 'Провести закупку'}</Button><Button variant="outline" onClick={() => setF(s => ({ ...s, open: false }))}>Отмена</Button></>}>
        {f.err && <div className="erp-form-err">{f.err}</div>}
        <Field label="Товар" required>
          <Select value={f.productId} onChange={e => { const p = (products || []).find(x => x.id === e.target.value); setF(s => ({ ...s, productId: e.target.value, price: p ? String(p.price) : s.price })); }}>
            <option value="">— выберите —</option>
            {(products || []).map(p => <option key={p.id} value={p.id}>{p.skuCode} · {p.name} (ост. {p.currentStock})</option>)}
          </Select>
        </Field>
        <div className="erp-form-row">
          <Field label="Количество" required><Input type="number" min={1} value={f.qty} onChange={e => setF(s => ({ ...s, qty: e.target.value }))} /></Field>
          <Field label="Цена за ед. (₸)"><Input type="number" min={0} value={f.price} onChange={e => setF(s => ({ ...s, price: e.target.value }))} /></Field>
        </div>
        <Field label="Поставщик"><Input value={f.supplier} onChange={e => setF(s => ({ ...s, supplier: e.target.value }))} /></Field>
        <div className="erp-form-row">
          <Field label="№ документа"><Input value={f.docNo} onChange={e => setF(s => ({ ...s, docNo: e.target.value }))} /></Field>
          <Field label="Дата"><Input type="date" value={f.date} onChange={e => setF(s => ({ ...s, date: e.target.value }))} /></Field>
        </div>
      </Modal>
    </div>
  );
}
