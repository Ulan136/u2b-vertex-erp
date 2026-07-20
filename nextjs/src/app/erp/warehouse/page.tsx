'use client';
import * as React from 'react';
import { useApi, apiSend } from '@/lib/api';
import { toast } from '@/lib/toast';
import { Card, Badge, Button, PageTitle, Modal, Field, Input, Select, EmptyRow } from '@/components/ui';

type Product = { id: string; skuCode: string; name: string; currentStock: number; minStock: number; price: string | number };
type Movement = { id: string; skuCode?: string | null; productName?: string | null; moveType: string; qty: number; price?: string | number; totalSum?: string | number; comment?: string | null; author?: string | null; moveDate?: string | null };

const fmt = (n: number | string) => (Number(n) || 0).toLocaleString('ru-RU');
const dmy = (d?: string | null) => (d ? String(d).slice(0, 10).split('-').reverse().join('.') : '');
const MOVE: Record<string, { label: string; tone: 'ok' | 'err' | 'info' }> = {
  'IN': { label: '📥 Приход', tone: 'ok' }, 'OUT': { label: '📤 Расход', tone: 'err' },
  'REV+': { label: '📋 Ревизия +', tone: 'info' }, 'REV-': { label: '📋 Ревизия −', tone: 'info' },
};

export default function WarehousePage() {
  const { data: products, error, isLoading, mutate } = useApi<Product[]>('/api/v2/products');
  const { data: movements, mutate: mutateMoves } = useApi<Movement[]>('/api/v2/products/movements?limit=40');
  const [q, setQ] = React.useState('');

  const [move, setMove] = React.useState<{ open: boolean; mode: 'IN' | 'OUT'; productId: string; qty: string; price: string; supplier: string; comment: string; err: string; saving: boolean }>({ open: false, mode: 'IN', productId: '', qty: '1', price: '', supplier: '', comment: '', err: '', saving: false });
  const [rev, setRev] = React.useState<{ open: boolean; reason: string; vals: Record<string, string>; saving: boolean }>({ open: false, reason: '', vals: {}, saving: false });

  const list = (products || []).filter(p => !q.trim() || p.name.toLowerCase().includes(q.toLowerCase()) || p.skuCode.toLowerCase().includes(q.toLowerCase()));
  const lowCount = (products || []).filter(p => Number(p.currentStock) < Number(p.minStock)).length;

  function openMove(mode: 'IN' | 'OUT', productId = '') {
    const p = (products || []).find(x => x.id === productId);
    setMove({ open: true, mode, productId, qty: '1', price: mode === 'IN' && p ? String(p.price) : '', supplier: '', comment: '', err: '', saving: false });
  }
  async function saveMove() {
    if (!move.productId) { setMove(m => ({ ...m, err: 'Выберите товар' })); return; }
    const qty = Number(move.qty) || 0;
    if (qty <= 0) { setMove(m => ({ ...m, err: 'Количество больше 0' })); return; }
    setMove(m => ({ ...m, saving: true, err: '' }));
    try {
      await apiSend('/api/v2/products', 'POST', { productId: move.productId, moveType: move.mode, qty, price: move.mode === 'IN' ? (Number(move.price) || 0) : undefined, supplier: move.supplier || null, comment: move.comment || null });
      setMove(m => ({ ...m, open: false })); await mutate(); await mutateMoves();
      toast(move.mode === 'IN' ? '📥 Приход проведён' : '📤 Расход проведён');
    } catch (e) { setMove(m => ({ ...m, err: (e as Error).message, saving: false })); }
  }

  function openRev() {
    const vals: Record<string, string> = {};
    (products || []).forEach(p => { vals[p.id] = String(p.currentStock); });
    setRev({ open: true, reason: '', vals, saving: false });
  }
  async function saveRev() {
    const changes = (products || []).map(p => ({ p, actual: Number(rev.vals[p.id]) })).filter(c => Number.isFinite(c.actual) && c.actual !== Number(c.p.currentStock));
    if (!changes.length) { toast('Нет изменений'); setRev(r => ({ ...r, open: false })); return; }
    setRev(r => ({ ...r, saving: true }));
    const reason = rev.reason.trim() || 'плановая';
    try {
      for (const c of changes) {
        const diff = c.actual - Number(c.p.currentStock);
        await apiSend('/api/v2/products', 'POST', { productId: c.p.id, moveType: diff > 0 ? 'REV+' : 'REV-', qty: Math.abs(diff), comment: 'Ревизия: ' + reason });
      }
      setRev(r => ({ ...r, open: false })); await mutate(); await mutateMoves();
      toast(`✅ Ревизия проведена: ${changes.length} позиций`);
    } catch (e) { toast('⚠️ ' + (e as Error).message); setRev(r => ({ ...r, saving: false })); }
  }

  return (
    <div>
      <PageTitle title="Склад" sub={lowCount ? `⚠️ ${lowCount} позиций ниже минимума` : 'Остатки в норме'} action={
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="outline" onClick={() => openMove('IN')}>📥 Приход</Button>
          <Button variant="outline" onClick={() => openMove('OUT')}>📤 Расход</Button>
          <Button onClick={openRev}>📋 Ревизия</Button>
        </div>} />

      <Card className="erp-filters"><Input placeholder="🔍 Наименование или SKU" value={q} onChange={e => setQ(e.target.value)} /></Card>

      <Card style={{ marginTop: 12, padding: 0 }}>
        {error ? <EmptyRow>Нет доступа к складу.</EmptyRow> : isLoading ? <EmptyRow>Загрузка…</EmptyRow> : (
          <table className="erp-table">
            <thead><tr><th>SKU</th><th>Наименование</th><th style={{ textAlign: 'right' }}>Остаток</th><th style={{ textAlign: 'right' }}>Мин</th><th style={{ textAlign: 'right' }}>Цена</th><th style={{ textAlign: 'right' }}>Движение</th></tr></thead>
            <tbody>
              {list.map(p => {
                const low = Number(p.currentStock) < Number(p.minStock);
                return (
                  <tr key={p.id}>
                    <td className="erp-muted" style={{ fontSize: 12 }}>{p.skuCode}</td>
                    <td className="erp-td-main">{p.name}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: low ? '#dc2626' : undefined }}>{fmt(p.currentStock)}{low ? ' ⚠️' : ''}</td>
                    <td style={{ textAlign: 'right' }} className="erp-muted">{fmt(p.minStock)}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(p.price)} ₸</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button className="erp-icon-btn" title="Приход" onClick={() => openMove('IN', p.id)}>📥</button>
                      <button className="erp-icon-btn" title="Расход" onClick={() => openMove('OUT', p.id)}>📤</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <h3 style={{ margin: '18px 0 8px', fontSize: 14 }}>Журнал движений</h3>
      <Card style={{ padding: 0 }}>
        {!movements || movements.length === 0 ? <EmptyRow>Движений пока нет. Проведите приход или ревизию.</EmptyRow> : (
          <table className="erp-table">
            <thead><tr><th>Дата</th><th>Товар</th><th>Тип</th><th style={{ textAlign: 'right' }}>Кол-во</th><th style={{ textAlign: 'right' }}>Сумма</th><th>Комментарий</th><th>Автор</th></tr></thead>
            <tbody>
              {movements.map(mv => (
                <tr key={mv.id}>
                  <td className="erp-muted" style={{ fontSize: 12 }}>{dmy(mv.moveDate)}</td>
                  <td>{mv.productName} <span className="erp-muted" style={{ fontSize: 11 }}>{mv.skuCode}</span></td>
                  <td><Badge tone={MOVE[mv.moveType]?.tone || 'neutral'}>{MOVE[mv.moveType]?.label || mv.moveType}</Badge></td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(mv.qty)}</td>
                  <td style={{ textAlign: 'right' }}>{Number(mv.totalSum) ? fmt(mv.totalSum ?? 0) + ' ₸' : '—'}</td>
                  <td className="erp-muted" style={{ fontSize: 12 }}>{mv.comment || '—'}</td>
                  <td className="erp-muted" style={{ fontSize: 12 }}>{mv.author || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Движение (приход/расход) */}
      <Modal open={move.open} onClose={() => setMove(m => ({ ...m, open: false }))} title={move.mode === 'IN' ? '📥 Приход' : '📤 Расход'}
        footer={<><Button onClick={saveMove} disabled={move.saving}>{move.saving ? 'Сохранение…' : 'Провести'}</Button><Button variant="outline" onClick={() => setMove(m => ({ ...m, open: false }))}>Отмена</Button></>}>
        {move.err && <div className="erp-form-err">{move.err}</div>}
        <Field label="Товар" required>
          <Select value={move.productId} onChange={e => { const p = (products || []).find(x => x.id === e.target.value); setMove(m => ({ ...m, productId: e.target.value, price: m.mode === 'IN' && p ? String(p.price) : m.price })); }}>
            <option value="">— выберите —</option>
            {(products || []).map(p => <option key={p.id} value={p.id}>{p.skuCode} · {p.name} (ост. {p.currentStock})</option>)}
          </Select>
        </Field>
        <div className="erp-form-row">
          <Field label="Количество" required><Input type="number" min={1} value={move.qty} onChange={e => setMove(m => ({ ...m, qty: e.target.value }))} /></Field>
          {move.mode === 'IN' && <Field label="Цена за ед. (₸)"><Input type="number" min={0} value={move.price} onChange={e => setMove(m => ({ ...m, price: e.target.value }))} /></Field>}
        </div>
        {move.mode === 'IN' && <Field label="Поставщик"><Input value={move.supplier} onChange={e => setMove(m => ({ ...m, supplier: e.target.value }))} /></Field>}
        <Field label="Комментарий"><Input value={move.comment} onChange={e => setMove(m => ({ ...m, comment: e.target.value }))} /></Field>
      </Modal>

      {/* Ревизия */}
      <Modal open={rev.open} onClose={() => setRev(r => ({ ...r, open: false }))} title="📋 Ревизия — фактические остатки" width={620}
        footer={<><Button onClick={saveRev} disabled={rev.saving}>{rev.saving ? 'Проведение…' : 'Провести ревизию'}</Button><Button variant="outline" onClick={() => setRev(r => ({ ...r, open: false }))}>Отмена</Button></>}>
        <Field label="Причина / комментарий"><Input value={rev.reason} onChange={e => setRev(r => ({ ...r, reason: e.target.value }))} placeholder="напр. плановая инвентаризация" /></Field>
        <div style={{ maxHeight: '46vh', overflowY: 'auto', marginTop: 8 }}>
          <table className="erp-table">
            <thead><tr><th>Товар</th><th style={{ textAlign: 'right' }}>Учёт</th><th style={{ textAlign: 'right', width: 110 }}>Факт</th></tr></thead>
            <tbody>
              {(products || []).map(p => {
                const changed = Number(rev.vals[p.id]) !== Number(p.currentStock) && rev.vals[p.id] !== '';
                return (
                  <tr key={p.id} style={changed ? { background: '#fffbeb' } : undefined}>
                    <td>{p.name} <span className="erp-muted" style={{ fontSize: 11 }}>{p.skuCode}</span></td>
                    <td style={{ textAlign: 'right' }} className="erp-muted">{fmt(p.currentStock)}</td>
                    <td style={{ textAlign: 'right' }}><Input type="number" value={rev.vals[p.id] ?? ''} onChange={e => setRev(r => ({ ...r, vals: { ...r.vals, [p.id]: e.target.value } }))} style={{ textAlign: 'right', padding: '4px 6px' }} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Modal>
    </div>
  );
}
