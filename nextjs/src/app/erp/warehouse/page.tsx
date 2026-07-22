'use client';
import * as React from 'react';
import { useApi, apiSend } from '@/lib/api';
import { toast } from '@/lib/toast';
import { Card, Badge, Button, PageTitle, Modal, Field, Input, Select, EmptyRow } from '@/components/ui';

type Product = { id: string; skuCode: string; name: string; fullName?: string | null; groupId?: string | null; waterType?: string | null; minStock: number; currentStock: number; reserved?: number | null; price: string | number; priceDiscount?: string | number | null; costPrice?: string | number | null };
type Movement = { id: string; skuCode?: string | null; productName?: string | null; moveType: string; qty: number; price?: string | number; totalSum?: string | number; supplier?: string | null; docNo?: string | null; comment?: string | null; author?: string | null; moveDate?: string | null };

const num = (v: unknown) => Number(v) || 0;
const fmt = (n: number | string) => (Number(n) || 0).toLocaleString('ru-RU');
const dmy = (d?: string | null) => (d ? String(d).slice(0, 10).split('-').reverse().join('.') : '');
const today = () => new Date().toISOString().slice(0, 10);
const free = (p: Product) => num(p.currentStock) - num(p.reserved);
const REASONS = ['💰 Продажа', '📋 Поверка', '❌ Брак', '↩ Возврат поставщику', '🏭 Внутреннее', '✏️ Другое'];
const GROUP_LABELS: Record<string, string> = { radio: '📡 Радиомодульные', impulse: '⚡ Импульсные', modem: '📶 Радиомодемы', other: '📦 Прочее' };
const groupLabel = (g?: string | null) => GROUP_LABELS[g || 'other'] || g || '📦 Прочее';
const MOVE: Record<string, { label: string; tone: 'ok' | 'err' | 'info' | 'neutral' }> = {
  'IN': { label: '📥 Приход', tone: 'ok' }, 'OUT': { label: '📤 Расход', tone: 'err' },
  'REV+': { label: '📋 Ревизия +', tone: 'info' }, 'REV-': { label: '📋 Ревизия −', tone: 'info' },
};
function statusBadge(p: Product) {
  const f = free(p);
  if (f <= 0) return <Badge tone="err">⚠ Нет</Badge>;
  if (f < num(p.minStock)) return <Badge tone="warn">⚠ Мало</Badge>;
  return <Badge tone="ok">✓ Норма</Badge>;
}

export default function WarehousePage() {
  const { data: products, error, isLoading, mutate } = useApi<Product[]>('/api/v2/products');
  const { data: movements, mutate: mutateMoves } = useApi<Movement[]>('/api/v2/products/movements?limit=60');
  const [tab, setTab] = React.useState<'stock' | 'moves'>('stock');
  const [q, setQ] = React.useState('');

  const all = products || [];
  const list = all.filter(p => !q.trim() || (p.name + ' ' + p.skuCode).toLowerCase().includes(q.toLowerCase()));
  const lowCount = all.filter(p => free(p) < num(p.minStock) && free(p) > 0).length;
  const emptyCount = all.filter(p => free(p) <= 0).length;
  const stockValue = all.reduce((s, p) => s + num(p.currentStock) * num(p.price), 0);

  // группировка остатков по группам товара
  const groups: Record<string, Product[]> = {};
  for (const p of list) (groups[p.groupId || 'other'] ||= []).push(p);

  const [move, setMove] = React.useState({ open: false, mode: 'IN' as 'IN' | 'OUT', productId: '', qty: '1', price: '', supplier: '', docNo: '', date: today(), reason: REASONS[0], comment: '', err: '', saving: false });
  const [rev, setRev] = React.useState({ open: false, reason: 'плановая инвентаризация', resp: '', date: today(), vals: {} as Record<string, string>, saving: false });
  const [set, setSet] = React.useState({ open: false, id: '', name: '', fullName: '', minStock: '', price: '', priceDiscount: '', cost: '', waterType: '', actual: '', err: '', saving: false });

  const prod = (id: string) => all.find(x => x.id === id);

  // Приход — цена по себестоимости (последняя закупка); если не задана — по цене продажи.
  const inPrice = (p?: Product) => { const c = num(p?.costPrice); return c > 0 ? c : num(p?.price); };
  function openMove(mode: 'IN' | 'OUT', productId = '') {
    const p = prod(productId);
    setMove({ open: true, mode, productId, qty: '1', price: mode === 'IN' && p ? String(inPrice(p)) : '', supplier: '', docNo: '', date: today(), reason: REASONS[0], comment: '', err: '', saving: false });
  }
  async function saveMove() {
    const p = prod(move.productId);
    if (!p) { setMove(m => ({ ...m, err: 'Выберите товар' })); return; }
    const qty = num(move.qty);
    if (qty <= 0) { setMove(m => ({ ...m, err: 'Количество больше 0' })); return; }
    if (move.mode === 'OUT' && qty > free(p)) { setMove(m => ({ ...m, err: `Недостаточно: свободно ${free(p)}` })); return; }
    setMove(m => ({ ...m, saving: true, err: '' }));
    const comment = move.mode === 'OUT' ? (move.reason + (move.comment ? ' · ' + move.comment : '')) : (move.comment || null);
    try {
      await apiSend('/api/v2/products', 'POST', { productId: move.productId, moveType: move.mode, qty, price: move.mode === 'IN' ? num(move.price) : undefined, supplier: move.supplier || null, docNo: move.docNo || null, moveDate: move.date || null, comment });
      setMove(m => ({ ...m, open: false })); await mutate(); await mutateMoves();
      toast(move.mode === 'IN' ? '📥 Приход проведён' : '📤 Расход проведён');
    } catch (e) { setMove(m => ({ ...m, err: (e as Error).message, saving: false })); }
  }

  function openRev() {
    const vals: Record<string, string> = {};
    all.forEach(p => { vals[p.id] = String(p.currentStock); });
    setRev({ open: true, reason: 'плановая инвентаризация', resp: '', date: today(), vals, saving: false });
  }
  async function saveRev() {
    const changes = all.map(p => ({ p, actual: num(rev.vals[p.id]) })).filter(c => Number.isFinite(c.actual) && c.actual !== num(c.p.currentStock) && rev.vals[c.p.id] !== '');
    if (!changes.length) { toast('Нет изменений'); setRev(r => ({ ...r, open: false })); return; }
    setRev(r => ({ ...r, saving: true }));
    try {
      for (const c of changes) {
        const diff = c.actual - num(c.p.currentStock);
        await apiSend('/api/v2/products', 'POST', { productId: c.p.id, moveType: diff > 0 ? 'REV+' : 'REV-', qty: Math.abs(diff), moveDate: rev.date || null, author: rev.resp || null, comment: 'Ревизия: ' + (rev.reason || 'плановая') });
      }
      setRev(r => ({ ...r, open: false })); await mutate(); await mutateMoves();
      toast(`✅ Ревизия проведена: ${changes.length} позиций`);
    } catch (e) { toast('⚠️ ' + (e as Error).message); setRev(r => ({ ...r, saving: false })); }
  }

  function openSet(p: Product) {
    setSet({ open: true, id: p.id, name: p.name, fullName: p.fullName || '', minStock: String(p.minStock ?? ''), price: String(p.price ?? ''), priceDiscount: String(p.priceDiscount ?? ''), cost: String(p.costPrice ?? ''), waterType: p.waterType || '', actual: String(p.currentStock), err: '', saving: false });
  }
  async function saveSet() {
    if (!set.name.trim()) { setSet(s => ({ ...s, err: 'Наименование обязательно' })); return; }
    setSet(s => ({ ...s, saving: true, err: '' }));
    const p = prod(set.id);
    try {
      await apiSend(`/api/v2/products/${set.id}`, 'PATCH', { name: set.name.trim(), fullName: set.fullName || null, minStock: num(set.minStock), price: num(set.price), priceDiscount: num(set.priceDiscount), costPrice: num(set.cost), waterType: set.waterType || null });
      // ревизия по одному товару — если фактический остаток изменён
      const actual = num(set.actual);
      if (p && Number.isFinite(actual) && actual !== num(p.currentStock)) {
        const diff = actual - num(p.currentStock);
        await apiSend('/api/v2/products', 'POST', { productId: set.id, moveType: diff > 0 ? 'REV+' : 'REV-', qty: Math.abs(diff), comment: 'Ревизия (карточка)' });
      }
      setSet(s => ({ ...s, open: false })); await mutate(); await mutateMoves(); toast('✅ Товар сохранён');
    } catch (e) { setSet(s => ({ ...s, err: (e as Error).message, saving: false })); }
  }

  // ── экспорт остатков ──
  async function exportWord() {
    const rows = all.map(p => [p.skuCode, p.name, fmt(p.currentStock), fmt(p.price), fmt(num(p.currentStock) * num(p.price))]);
    const spec = { titleLines: ['Складская ведомость (остатки)'], subtitle: `Позиций: ${all.length} · стоимость: ${fmt(stockValue)} ₸`, orientation: 'portrait', columns: [{ header: 'SKU', width: 12 }, { header: 'Наименование', width: 40, align: 'left' }, { header: 'Остаток', width: 12, align: 'right' }, { header: 'Цена', width: 14, align: 'right' }, { header: 'Сумма', width: 16, align: 'right' }], rows, totalRow: ['', 'ИТОГО', '', '', fmt(stockValue)], signatures: ['Кладовщик', 'Директор'], filename: 'Склад_остатки.docx' };
    try {
      const r = await fetch('/api/v2/docx', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(spec) });
      if (!r.ok) throw new Error('Ошибка выгрузки');
      const b = await r.blob(); const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(b), download: 'Склад_остатки.docx' }); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (e) { toast('⚠️ ' + (e as Error).message); }
  }
  function printInvoice() {
    const rows = all.map((p, i) => `<tr><td>${i + 1}</td><td style="text-align:left">${p.skuCode} · ${p.name}</td><td>${fmt(p.currentStock)}</td><td style="text-align:right">${fmt(p.price)}</td><td style="text-align:right">${fmt(num(p.currentStock) * num(p.price))}</td></tr>`).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Складская ведомость</title><style>@page{size:A4;margin:14mm}body{font-family:'Times New Roman',serif;font-size:12px}h2{text-align:center;margin:0 0 6px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #000;padding:4px;text-align:center}</style></head><body><h2>Складская ведомость (остатки)</h2><div style="text-align:center;margin-bottom:6px">Позиций: ${all.length} · стоимость склада: ${fmt(stockValue)} ₸</div><table><thead><tr><th>№</th><th>Наименование</th><th>Остаток</th><th>Цена</th><th>Сумма</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="4" style="text-align:right"><b>Итого</b></td><td style="text-align:right"><b>${fmt(stockValue)} ₸</b></td></tr></tfoot></table><div style="margin-top:36px">Кладовщик _____________ / _____________ /</div><div style="margin-top:20px">Директор _____________ / М.Молдабаев /</div><script>window.onload=()=>window.print()<\/script></body></html>`;
    const b = new Blob([html], { type: 'text/html' }); const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(b), target: '_blank' }); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  const moveProduct = prod(move.productId);

  return (
    <div>
      <PageTitle title="Склад" sub="Остатки · движения · ведомость" action={
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="outline" onClick={printInvoice}>🖨 Ведомость</Button>
          <Button variant="outline" onClick={exportWord}>⬇ Word</Button>
          <Button variant="outline" onClick={openRev}>📋 Ревизия</Button>
          <Button variant="outline" onClick={() => openMove('OUT')}>📤 Расход</Button>
          <Button onClick={() => openMove('IN')}>📥 Приход</Button>
        </div>} />

      <div className="erp-kpi-grid">
        <div className="erp-kpi"><div className="erp-kpi-top"><span className="erp-kpi-ico">📦</span><span className="erp-kpi-label">Позиций</span></div><div className="erp-kpi-val">{all.length}</div></div>
        <div className="erp-kpi"><div className="erp-kpi-top"><span className="erp-kpi-ico">⚠️</span><span className="erp-kpi-label">Ниже минимума</span></div><div className="erp-kpi-val" style={{ color: '#b45309' }}>{lowCount}</div></div>
        <div className="erp-kpi"><div className="erp-kpi-top"><span className="erp-kpi-ico">🚫</span><span className="erp-kpi-label">Нет в наличии</span></div><div className="erp-kpi-val" style={{ color: '#dc2626' }}>{emptyCount}</div></div>
        <div className="erp-kpi"><div className="erp-kpi-top"><span className="erp-kpi-ico">💰</span><span className="erp-kpi-label">Стоимость склада</span></div><div className="erp-kpi-val">{fmt(stockValue)} ₸</div></div>
      </div>

      <Card className="erp-filters" style={{ marginTop: 12 }}>
        <div className="erp-chips">
          <button className={`erp-chip${tab === 'stock' ? ' on' : ''}`} onClick={() => setTab('stock')}>📦 Остатки</button>
          <button className={`erp-chip${tab === 'moves' ? ' on' : ''}`} onClick={() => setTab('moves')}>📋 Движения</button>
        </div>
        {tab === 'stock' && <Input placeholder="🔍 Наименование или SKU" value={q} onChange={e => setQ(e.target.value)} />}
      </Card>

      {tab === 'stock' ? (
        <Card style={{ marginTop: 12, padding: 0, overflowX: 'auto' }}>
          {error ? <EmptyRow>Нет доступа к складу.</EmptyRow> : isLoading ? <EmptyRow>Загрузка…</EmptyRow>
            : all.length === 0 ? <EmptyRow>💡 Склад пустой. Нажмите «📥 Приход».</EmptyRow>
            : (
              <table className="erp-table">
                <thead><tr><th>SKU</th><th>Наименование</th><th>Вода</th><th style={{ textAlign: 'right' }}>Остаток</th><th style={{ textAlign: 'right' }}>Резерв</th><th style={{ textAlign: 'right' }}>Свободно</th><th style={{ textAlign: 'right' }}>Мин</th><th style={{ textAlign: 'right' }}>Себест.</th><th style={{ textAlign: 'right' }}>Цена</th><th style={{ textAlign: 'right' }}>Со скидкой</th><th>Статус</th><th style={{ textAlign: 'right' }}>Действия</th></tr></thead>
                <tbody>
                  {Object.entries(groups).map(([gid, items]) => (
                    <React.Fragment key={gid}>
                      <tr><td colSpan={12} className="erp-group-sub">{groupLabel(gid)} <span className="erp-block-count">· {items.length}</span></td></tr>
                      {items.map(p => {
                        const f = free(p); const low = f < num(p.minStock);
                        return (
                          <tr key={p.id}>
                            <td className="erp-muted" style={{ fontSize: 12 }}>{p.skuCode}</td>
                            <td className="erp-td-main" title={p.fullName || p.name}>{p.name}</td>
                            <td style={{ fontSize: 12 }}>{p.waterType === 'г/в' ? '🔴 г/в' : p.waterType === 'х/в' ? '🔵 х/в' : '—'}</td>
                            <td style={{ textAlign: 'right', fontWeight: 700, color: low ? '#dc2626' : undefined }}>{fmt(p.currentStock)}</td>
                            <td style={{ textAlign: 'right' }} className="erp-muted">{fmt(p.reserved || 0)}</td>
                            <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(f)}</td>
                            <td style={{ textAlign: 'right' }} className="erp-muted">{fmt(p.minStock)}</td>
                            <td style={{ textAlign: 'right' }} className="erp-muted">{num(p.costPrice) ? fmt(p.costPrice!) : '—'}</td>
                            <td style={{ textAlign: 'right' }}>{fmt(p.price)}</td>
                            <td style={{ textAlign: 'right' }} className="erp-muted">{num(p.priceDiscount) ? fmt(p.priceDiscount!) : '—'}</td>
                            <td>{statusBadge(p)}</td>
                            <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                              <button className="erp-icon-btn" title="Приход" onClick={() => openMove('IN', p.id)}>📥</button>
                              <button className="erp-icon-btn" title="Расход" onClick={() => openMove('OUT', p.id)}>📤</button>
                              <button className="erp-icon-btn" title="Настройки товара" onClick={() => openSet(p)}>⚙️</button>
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            )}
        </Card>
      ) : (
        <Card style={{ marginTop: 12, padding: 0, overflowX: 'auto' }}>
          {!movements || movements.length === 0 ? <EmptyRow>Движений пока нет. Проведите приход или ревизию.</EmptyRow> : (
            <table className="erp-table">
              <thead><tr><th>Дата</th><th>SKU</th><th>Товар</th><th>Тип</th><th style={{ textAlign: 'right' }}>Кол-во</th><th style={{ textAlign: 'right' }}>Сумма</th><th>Контрагент</th><th>Документ</th><th>Комментарий</th><th>Автор</th></tr></thead>
              <tbody>
                {movements.map(mv => (
                  <tr key={mv.id}>
                    <td className="erp-muted" style={{ fontSize: 12 }}>{dmy(mv.moveDate)}</td>
                    <td className="erp-muted" style={{ fontSize: 12 }}>{mv.skuCode}</td>
                    <td>{mv.productName}</td>
                    <td><Badge tone={MOVE[mv.moveType]?.tone || 'neutral'}>{MOVE[mv.moveType]?.label || mv.moveType}</Badge></td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(mv.qty)}</td>
                    <td style={{ textAlign: 'right' }}>{num(mv.totalSum) ? fmt(mv.totalSum!) + ' ₸' : '—'}</td>
                    <td style={{ fontSize: 12 }}>{mv.supplier || '—'}</td>
                    <td style={{ fontSize: 12 }}>{mv.docNo || '—'}</td>
                    <td className="erp-muted" style={{ fontSize: 12 }}>{mv.comment || '—'}</td>
                    <td className="erp-muted" style={{ fontSize: 12 }}>{mv.author || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {/* Движение (приход/расход) */}
      <Modal open={move.open} onClose={() => setMove(m => ({ ...m, open: false }))} title={move.mode === 'IN' ? '📥 Приход на склад' : '📤 Расход со склада'} width={560}
        footer={<><Button onClick={saveMove} disabled={move.saving}>{move.saving ? 'Сохранение…' : 'Провести'}</Button><Button variant="outline" onClick={() => setMove(m => ({ ...m, open: false }))}>Отмена</Button></>}>
        {move.err && <div className="erp-form-err">{move.err}</div>}
        <Field label="Товар" required>
          <Select value={move.productId} onChange={e => { const p = prod(e.target.value); setMove(m => ({ ...m, productId: e.target.value, price: m.mode === 'IN' && p ? String(inPrice(p)) : m.price })); }}>
            <option value="">— выберите —</option>
            {all.map(p => <option key={p.id} value={p.id}>{p.skuCode} · {p.name} (своб. {free(p)})</option>)}
          </Select>
          {move.mode === 'OUT' && moveProduct && <div className="erp-muted" style={{ fontSize: 11, marginTop: 4 }}>Свободно: <b>{free(moveProduct)}</b> шт.</div>}
        </Field>
        <div className="erp-form-row">
          <Field label="Количество" required><Input type="number" min={1} max={move.mode === 'OUT' && moveProduct ? free(moveProduct) : undefined} value={move.qty} onChange={e => setMove(m => ({ ...m, qty: e.target.value }))} /></Field>
          {move.mode === 'IN' && <Field label="Цена за ед. (₸)"><Input type="number" min={0} value={move.price} onChange={e => setMove(m => ({ ...m, price: e.target.value }))} /></Field>}
          {move.mode === 'OUT' && <Field label="Причина списания" required><Select value={move.reason} onChange={e => setMove(m => ({ ...m, reason: e.target.value }))}>{REASONS.map(r => <option key={r}>{r}</option>)}</Select></Field>}
        </div>
        <div className="erp-form-row">
          <Field label={move.mode === 'IN' ? 'Поставщик' : 'Контрагент'}><Input value={move.supplier} onChange={e => setMove(m => ({ ...m, supplier: e.target.value }))} /></Field>
          <Field label="№ документа"><Input value={move.docNo} onChange={e => setMove(m => ({ ...m, docNo: e.target.value }))} /></Field>
        </div>
        <div className="erp-form-row">
          <Field label={move.mode === 'IN' ? 'Дата прихода' : 'Дата'}><Input type="date" value={move.date} onChange={e => setMove(m => ({ ...m, date: e.target.value }))} /></Field>
          <Field label="Комментарий"><Input value={move.comment} onChange={e => setMove(m => ({ ...m, comment: e.target.value }))} /></Field>
        </div>
        {move.mode === 'IN' && <div className="erp-muted" style={{ fontSize: 11 }}>Остаток увеличится, а цена запишется в себестоимость товара.</div>}
      </Modal>

      {/* Настройки товара */}
      <Modal open={set.open} onClose={() => setSet(s => ({ ...s, open: false }))} title="⚙️ Карточка товара" width={520}
        footer={<><Button onClick={saveSet} disabled={set.saving}>{set.saving ? 'Сохранение…' : 'Сохранить'}</Button><Button variant="outline" onClick={() => setSet(s => ({ ...s, open: false }))}>Отмена</Button></>}>
        {set.err && <div className="erp-form-err">{set.err}</div>}
        <Field label="Полное наименование"><Input value={set.name} onChange={e => setSet(s => ({ ...s, name: e.target.value }))} /></Field>
        <Field label="Описание / доп."><Input value={set.fullName} onChange={e => setSet(s => ({ ...s, fullName: e.target.value }))} /></Field>
        <div className="erp-form-row">
          <Field label="Мин. остаток"><Input type="number" min={0} value={set.minStock} onChange={e => setSet(s => ({ ...s, minStock: e.target.value }))} /></Field>
          <Field label="Тип воды"><Select value={set.waterType} onChange={e => setSet(s => ({ ...s, waterType: e.target.value }))}><option value="">—</option><option>х/в</option><option>г/в</option></Select></Field>
        </div>
        <div className="erp-form-row">
          <Field label="Цена продажи (₸)"><Input type="number" min={0} value={set.price} onChange={e => setSet(s => ({ ...s, price: e.target.value }))} /></Field>
          <Field label="Цена со скидкой (₸)"><Input type="number" min={0} value={set.priceDiscount} onChange={e => setSet(s => ({ ...s, priceDiscount: e.target.value }))} /></Field>
        </div>
        <Field label="Себестоимость (₸)"><Input type="number" min={0} value={set.cost} onChange={e => setSet(s => ({ ...s, cost: e.target.value }))} /><div className="erp-muted" style={{ fontSize: 11, marginTop: 4 }}>Обновляется автоматически при приходе (последняя цена закупки).</div></Field>
        <Field label="Фактический остаток (ревизия по товару)"><Input type="number" value={set.actual} onChange={e => setSet(s => ({ ...s, actual: e.target.value }))} /></Field>
        <div className="erp-muted" style={{ fontSize: 11 }}>Остаток нельзя менять напрямую — изменение проведётся ревизией (REV±).</div>
      </Modal>

      {/* Ревизия (все товары) */}
      <Modal open={rev.open} onClose={() => setRev(r => ({ ...r, open: false }))} title="📋 Акт ревизии — фактические остатки" width={680}
        footer={<><Button onClick={saveRev} disabled={rev.saving}>{rev.saving ? 'Проведение…' : 'Провести ревизию'}</Button><Button variant="outline" onClick={() => setRev(r => ({ ...r, open: false }))}>Отмена</Button></>}>
        <div className="erp-form-row">
          <Field label="Ответственный (ФИО)"><Input value={rev.resp} onChange={e => setRev(r => ({ ...r, resp: e.target.value }))} /></Field>
          <Field label="Дата ревизии"><Input type="date" value={rev.date} onChange={e => setRev(r => ({ ...r, date: e.target.value }))} /></Field>
        </div>
        <Field label="Причина расхождения"><Input value={rev.reason} onChange={e => setRev(r => ({ ...r, reason: e.target.value }))} placeholder="напр. плановая инвентаризация" /></Field>
        <div style={{ maxHeight: '42vh', overflowY: 'auto', marginTop: 8 }}>
          <table className="erp-table">
            <thead><tr><th>Товар</th><th style={{ textAlign: 'right' }}>Учёт</th><th style={{ textAlign: 'right', width: 100 }}>Факт</th><th style={{ textAlign: 'right' }}>Разница</th></tr></thead>
            <tbody>
              {all.map(p => {
                const actual = rev.vals[p.id] === '' ? NaN : num(rev.vals[p.id]);
                const diff = Number.isFinite(actual) ? actual - num(p.currentStock) : 0;
                return (
                  <tr key={p.id} style={diff !== 0 ? { background: '#fffbeb' } : undefined}>
                    <td>{p.name} <span className="erp-muted" style={{ fontSize: 11 }}>{p.skuCode}</span></td>
                    <td style={{ textAlign: 'right' }} className="erp-muted">{fmt(p.currentStock)}</td>
                    <td style={{ textAlign: 'right' }}><Input type="number" value={rev.vals[p.id] ?? ''} onChange={e => setRev(r => ({ ...r, vals: { ...r.vals, [p.id]: e.target.value } }))} style={{ textAlign: 'right', padding: '4px 6px' }} /></td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: diff > 0 ? '#16a34a' : diff < 0 ? '#dc2626' : '#94a3b8' }}>{diff > 0 ? '+' : ''}{diff || '—'}</td>
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
