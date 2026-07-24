'use client';
import * as React from 'react';
import { formatDate } from '@/lib/format';
import { useApi, apiSend } from '@/lib/api';
import { toast } from '@/lib/toast';
import { Card, Badge, Button, PageTitle, Modal, Field, Input, Select, EmptyRow } from '@/components/ui';

type Client = { id: string; name: string; phone?: string | null; kind?: string | null; categoryId?: string | null; createdByName?: string | null };
type Cat = { id: string; name: string };
type Sale = { id: string; saleNo?: string | null; saleDate?: string | null; clientName?: string | null; productName?: string | null; totalSum?: string | number; payStatus?: string | null; cancelledAt?: string | null };

const num = (v: unknown) => Number(v) || 0;
const fmt = (n: number | string) => (Number(n) || 0).toLocaleString('ru-RU');
const dmy = (d?: string | null) => formatDate(d);
const EMPTY = { id: '', name: '', phone: '', kind: 'client', categoryId: '' };

export default function ClientsPage() {
  const [tab, setTab] = React.useState<'client' | 'buyer'>('client');
  const [cat, setCat] = React.useState('');
  const [q, setQ] = React.useState('');
  const [qd, setQd] = React.useState('');
  React.useEffect(() => { const t = setTimeout(() => setQd(q), 300); return () => clearTimeout(t); }, [q]);
  const [modal, setModal] = React.useState(false);
  const [catModal, setCatModal] = React.useState(false);
  const [form, setForm] = React.useState<typeof EMPTY>(EMPTY);
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState('');
  const [newCat, setNewCat] = React.useState('');
  const [salesHist, setSalesHist] = React.useState<string | null>(null);

  const params = new URLSearchParams();
  params.set('kind', tab);
  if (tab === 'client' && cat) params.set('categoryId', cat);
  if (qd.trim()) params.set('q', qd.trim());
  const { data: clients, error, isLoading, mutate } = useApi<Client[]>('/api/v2/clients?' + params);
  const { data: cats, mutate: mutateCats } = useApi<Cat[]>('/api/v2/client-categories');
  const { data: allSales } = useApi<Sale[]>(salesHist ? '/api/v2/sales' : null);

  const isBuyer = tab === 'buyer';
  const catName = (id?: string | null) => (cats || []).find(c => c.id === id)?.name;
  const list = clients || [];
  const histSales = React.useMemo(() => salesHist ? (allSales || []).filter(s => (s.clientName || '').trim().toLowerCase() === salesHist.trim().toLowerCase()) : [], [salesHist, allSales]);

  const openNew = () => { setForm({ ...EMPTY, kind: tab, categoryId: tab === 'client' && cat && cat !== 'none' ? cat : '' }); setErr(''); setModal(true); };
  const openEdit = (c: Client) => { setForm({ id: c.id, name: c.name, phone: c.phone || '', kind: c.kind || 'client', categoryId: c.categoryId || '' }); setErr(''); setModal(true); };

  async function save() {
    if (!form.name.trim()) { setErr('Введите имя'); return; }
    setSaving(true); setErr('');
    const body = { name: form.name.trim(), phone: form.phone || null, kind: form.kind, categoryId: form.kind === 'client' ? (form.categoryId || null) : null };
    try {
      if (form.id) await apiSend(`/api/v2/clients/${form.id}`, 'PATCH', body);
      else await apiSend('/api/v2/clients', 'POST', body);
      setModal(false); await mutate(); toast(form.id ? '✅ Обновлено' : (isBuyer ? '✅ Покупатель добавлен' : '✅ Клиент добавлен'));
    } catch (e) { setErr((e as Error).message); } finally { setSaving(false); }
  }
  async function remove(c: Client) {
    if (!confirm(`Удалить «${c.name}»?`)) return;
    try { await apiSend(`/api/v2/clients/${c.id}`, 'DELETE'); await mutate(); toast('🗑️ Удалено'); }
    catch (e) { toast('⚠️ ' + (e as Error).message); }
  }
  async function addCat() {
    if (!newCat.trim()) return;
    try { await apiSend('/api/v2/client-categories', 'POST', { name: newCat.trim() }); setNewCat(''); await mutateCats(); toast('✅ Категория добавлена'); }
    catch (e) { toast('⚠️ ' + (e as Error).message); }
  }
  async function renameCat(c: Cat, name: string) {
    if (!name.trim() || name === c.name) return;
    try { await apiSend(`/api/v2/client-categories/${c.id}`, 'PATCH', { name: name.trim() }); await mutateCats(); toast('✅ Переименовано'); }
    catch (e) { toast('⚠️ ' + (e as Error).message); }
  }
  async function delCat(c: Cat) {
    if (!confirm(`Удалить категорию «${c.name}»? Клиенты станут «без категории».`)) return;
    try { await apiSend(`/api/v2/client-categories/${c.id}`, 'DELETE'); await mutateCats(); await mutate(); toast('🗑️ Категория удалена'); }
    catch (e) { toast('⚠️ ' + (e as Error).message); }
  }

  return (
    <div>
      <PageTitle title="Клиенты и покупатели" sub={`${isBuyer ? 'Покупатели' : 'Клиенты'}: ${list.length}`} action={
        <div style={{ display: 'flex', gap: 8 }}>
          {!isBuyer && <Button variant="outline" onClick={() => setCatModal(true)}>Категории</Button>}
          <Button onClick={openNew}>+ {isBuyer ? 'Покупатель' : 'Клиент'}</Button>
        </div>} />

      <Card className="erp-filters">
        <div className="erp-chips">
          <button className={`erp-chip${tab === 'client' ? ' on' : ''}`} onClick={() => setTab('client')}>🤝 Клиенты</button>
          <button className={`erp-chip${tab === 'buyer' ? ' on' : ''}`} onClick={() => setTab('buyer')}>🛒 Покупатели</button>
        </div>
        {!isBuyer && (
          <Select value={cat} onChange={e => setCat(e.target.value)}>
            <option value="">Все категории</option>
            <option value="none">Без категории</option>
            {(cats || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        )}
        <Input placeholder="🔍 Имя или телефон" value={q} onChange={e => setQ(e.target.value)} />
      </Card>

      {!isBuyer && (
        <Card className="erp-filters" style={{ marginTop: 12 }}>
          <span className="erp-muted" style={{ fontSize: 12 }}>🏷 Категории:</span>
          {(cats || []).length === 0
            ? <span className="erp-muted" style={{ fontSize: 12 }}>Пока нет категорий.</span>
            : (cats || []).map(c => (
              <span key={c.id} className={`erp-chip${cat === c.id ? ' on' : ''}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <span style={{ cursor: 'pointer' }} onClick={() => setCat(cat === c.id ? '' : c.id)}>{c.name}</span>
                <span style={{ cursor: 'pointer', opacity: .6 }} title="Удалить" onClick={() => delCat(c)}>✕</span>
              </span>
            ))}
          <Button variant="outline" onClick={() => setCatModal(true)} style={{ fontSize: 12, padding: '5px 11px' }}>+ Категория</Button>
        </Card>
      )}

      <Card style={{ marginTop: 12, padding: 0 }}>
        {error ? <EmptyRow>Нет доступа.</EmptyRow>
          : isLoading ? <EmptyRow>Загрузка…</EmptyRow>
          : list.length === 0 ? <EmptyRow>{isBuyer ? 'Покупателей нет. Появятся сами при продажах или нажмите «+ Покупатель».' : 'Клиентов нет. Нажмите «+ Клиент».'}</EmptyRow>
          : (
            <table className="erp-table">
              <thead><tr><th>Имя</th><th>Телефон</th>{!isBuyer && <th>Категория</th>}<th>Кто завёл</th><th style={{ textAlign: 'right' }}>Действия</th></tr></thead>
              <tbody>
                {list.map(c => (
                  <tr key={c.id}>
                    <td className="erp-td-main">{isBuyer ? '🛒' : '🤝'} {c.name}</td>
                    <td style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 13 }}>{c.phone || '—'}</td>
                    {!isBuyer && <td>{catName(c.categoryId) ? <Badge tone="info">{catName(c.categoryId)}</Badge> : <span className="erp-muted">—</span>}</td>}
                    <td className="erp-muted" style={{ fontSize: 12 }}>{c.createdByName || '—'}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button className="erp-icon-btn" title="История продаж" onClick={() => setSalesHist(c.name)}>🧾</button>
                      <button className="erp-icon-btn" title="Изменить" onClick={() => openEdit(c)}>✏️</button>
                      <button className="erp-icon-btn" title="Удалить" style={{ color: '#dc2626' }} onClick={() => remove(c)}>🗑️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </Card>

      <Modal open={modal} onClose={() => setModal(false)} title={form.id ? (isBuyer ? '✏️ Покупатель' : '✏️ Клиент') : (isBuyer ? '➕ Новый покупатель' : '➕ Новый клиент')}
        footer={<><Button onClick={save} disabled={saving}>{saving ? 'Сохранение…' : 'Сохранить'}</Button><Button variant="outline" onClick={() => setModal(false)}>Отмена</Button></>}>
        {err && <div className="erp-form-err">{err}</div>}
        <Field label="Имя / название" required><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} autoFocus /></Field>
        <div className="erp-form-row">
          <Field label={isBuyer ? 'Телефон (необязательно)' : 'Телефон'}><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+7 7XX XXX XX XX" /></Field>
          {!isBuyer && <Field label="Категория"><Select value={form.categoryId} onChange={e => setForm({ ...form, categoryId: e.target.value })}><option value="">— без категории —</option>{(cats || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>}
        </div>
        <Field label="Тип записи"><div className="erp-chips">
          <button type="button" className={`erp-chip${form.kind === 'client' ? ' on' : ''}`} onClick={() => setForm({ ...form, kind: 'client' })}>🤝 Клиент (скидка)</button>
          <button type="button" className={`erp-chip${form.kind === 'buyer' ? ' on' : ''}`} onClick={() => setForm({ ...form, kind: 'buyer' })}>🛒 Покупатель</button>
        </div></Field>
      </Modal>

      <Modal open={catModal} onClose={() => setCatModal(false)} title="🏷 Категории клиентов" width={440}
        footer={<Button variant="outline" onClick={() => setCatModal(false)}>Закрыть</Button>}>
        <div className="erp-cat-add">
          <Input placeholder="Например: ТЭЦ, ОСИ, Частники" value={newCat} onChange={e => setNewCat(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addCat(); }} />
          <Button onClick={addCat}>Добавить</Button>
        </div>
        <div style={{ marginTop: 12 }}>
          {(cats || []).length === 0 ? <EmptyRow>Категорий нет.</EmptyRow> : (cats || []).map(c => (
            <div className="erp-cat-row" key={c.id}>
              <Input defaultValue={c.name} onBlur={e => renameCat(c, e.target.value)} />
              <button className="erp-icon-btn" title="Удалить" style={{ color: '#dc2626' }} onClick={() => delCat(c)}>🗑️</button>
            </div>
          ))}
        </div>
      </Modal>

      {/* История продаж */}
      <Modal open={!!salesHist} onClose={() => setSalesHist(null)} title={`🧾 Продажи — ${salesHist || ''}`} width={620}
        footer={<Button variant="outline" onClick={() => setSalesHist(null)}>Закрыть</Button>}>
        {!allSales ? <div className="erp-muted">Загрузка…</div> : histSales.length === 0 ? <EmptyRow>Продаж нет.</EmptyRow> : (<>
          <div className="erp-muted" style={{ fontSize: 13, marginBottom: 8 }}>Всего: {histSales.length} · на {fmt(histSales.filter(s => !s.cancelledAt).reduce((a, s) => a + num(s.totalSum), 0))} ₸</div>
          <table className="erp-table" style={{ fontSize: 12 }}>
            <thead><tr><th>№</th><th>Дата</th><th>Товар</th><th style={{ textAlign: 'right' }}>Сумма</th><th>Оплата</th></tr></thead>
            <tbody>{histSales.map(s => (
              <tr key={s.id} style={s.cancelledAt ? { opacity: 0.5, textDecoration: 'line-through' } : undefined}>
                <td className="erp-muted">{s.saleNo}</td><td className="erp-muted">{dmy(s.saleDate)}</td>
                <td>{s.productName || '—'}</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(s.totalSum || 0)} ₸</td>
                <td>{s.cancelledAt ? <Badge tone="err">Отменена</Badge> : <Badge tone={s.payStatus === 'Оплачено' ? 'ok' : 'warn'}>{s.payStatus || 'Ожидает'}</Badge>}</td>
              </tr>
            ))}</tbody>
          </table>
        </>)}
      </Modal>
    </div>
  );
}
