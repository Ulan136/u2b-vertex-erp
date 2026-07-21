'use client';
import * as React from 'react';
import { useApi, apiSend } from '@/lib/api';
import { toast } from '@/lib/toast';
import { Card, Badge, Button, PageTitle, Modal, Field, Input, Select, EmptyRow } from '@/components/ui';

type Client = { id: string; name: string; phone?: string | null; categoryId?: string | null };
type Cat = { id: string; name: string };

const EMPTY = { id: '', name: '', phone: '', categoryId: '' };

export default function ClientsPage() {
  const [cat, setCat] = React.useState('');
  const [q, setQ] = React.useState('');
  const [qd, setQd] = React.useState('');   // дебаунс-версия поиска (как в старом, 300 мс)
  React.useEffect(() => { const t = setTimeout(() => setQd(q), 300); return () => clearTimeout(t); }, [q]);
  const [modal, setModal] = React.useState(false);
  const [catModal, setCatModal] = React.useState(false);
  const [form, setForm] = React.useState<typeof EMPTY>(EMPTY);
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState('');
  const [newCat, setNewCat] = React.useState('');

  const params = new URLSearchParams();
  if (cat) params.set('categoryId', cat);
  if (qd.trim()) params.set('q', qd.trim());
  const { data: clients, error, isLoading, mutate } = useApi<Client[]>('/api/v2/clients' + (params.toString() ? '?' + params : ''));
  const { data: cats, mutate: mutateCats } = useApi<Cat[]>('/api/v2/client-categories');

  const catName = (id?: string | null) => (cats || []).find(c => c.id === id)?.name;
  const list = clients || [];

  const openNew = () => { setForm({ ...EMPTY, categoryId: cat && cat !== 'none' ? cat : '' }); setErr(''); setModal(true); };
  const openEdit = (c: Client) => { setForm({ id: c.id, name: c.name, phone: c.phone || '', categoryId: c.categoryId || '' }); setErr(''); setModal(true); };

  async function save() {
    if (!form.name.trim()) { setErr('Введите имя'); return; }
    setSaving(true); setErr('');
    const body = { name: form.name.trim(), phone: form.phone || null, categoryId: form.categoryId || null };
    try {
      if (form.id) await apiSend(`/api/v2/clients/${form.id}`, 'PATCH', body);
      else await apiSend('/api/v2/clients', 'POST', body);
      setModal(false); await mutate(); toast(form.id ? '✅ Клиент обновлён' : '✅ Клиент добавлен');
    } catch (e) { setErr((e as Error).message); } finally { setSaving(false); }
  }
  async function remove(c: Client) {
    if (!confirm(`Удалить клиента «${c.name}»?`)) return;
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
      <PageTitle title="Клиенты" sub={`Всего: ${list.length}`} action={
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="outline" onClick={() => setCatModal(true)}>Категории</Button>
          <Button onClick={openNew}>+ Клиент</Button>
        </div>} />

      <Card className="erp-filters">
        <Select value={cat} onChange={e => setCat(e.target.value)}>
          <option value="">Все категории</option>
          <option value="none">Без категории</option>
          {(cats || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Input placeholder="🔍 Имя или телефон" value={q} onChange={e => setQ(e.target.value)} />
      </Card>

      {/* Инлайн-полоса категорий: клик по бейджу — фильтр, ✕ — удалить (как в старом) */}
      <Card className="erp-filters" style={{ marginTop: 12 }}>
        <span className="erp-muted" style={{ fontSize: 12 }}>🏷 Категории:</span>
        {(cats || []).length === 0
          ? <span className="erp-muted" style={{ fontSize: 12 }}>Пока нет категорий. Нажмите «+ Категория».</span>
          : (cats || []).map(c => (
            <span key={c.id} className={`erp-chip${cat === c.id ? ' on' : ''}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <span style={{ cursor: 'pointer' }} onClick={() => setCat(cat === c.id ? '' : c.id)}>{c.name}</span>
              <span style={{ cursor: 'pointer', opacity: .6 }} title="Удалить категорию" onClick={() => delCat(c)}>✕</span>
            </span>
          ))}
        <Button variant="outline" onClick={() => setCatModal(true)} style={{ fontSize: 12, padding: '5px 11px' }}>+ Категория</Button>
      </Card>

      <Card style={{ marginTop: 12, padding: 0 }}>
        {error ? <EmptyRow>Нет доступа к клиентам.</EmptyRow>
          : isLoading ? <EmptyRow>Загрузка…</EmptyRow>
          : list.length === 0 ? <EmptyRow>Клиентов нет. Нажмите «+ Клиент».</EmptyRow>
          : (
            <table className="erp-table">
              <thead><tr><th>Имя</th><th>Телефон</th><th>Категория</th><th style={{ textAlign: 'right' }}>Действия</th></tr></thead>
              <tbody>
                {list.map(c => (
                  <tr key={c.id}>
                    <td className="erp-td-main">{c.name}</td>
                    <td style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 13 }}>{c.phone || '—'}</td>
                    <td>{catName(c.categoryId) ? <Badge tone="info">{catName(c.categoryId)}</Badge> : <span className="erp-muted">—</span>}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button className="erp-icon-btn" title="Изменить" onClick={() => openEdit(c)}>✏️</button>
                      <button className="erp-icon-btn" title="Удалить" style={{ color: '#dc2626' }} onClick={() => remove(c)}>🗑️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </Card>

      <Modal open={modal} onClose={() => setModal(false)} title={form.id ? '✏️ Клиент' : '➕ Новый клиент'}
        footer={<><Button onClick={save} disabled={saving}>{saving ? 'Сохранение…' : 'Сохранить'}</Button><Button variant="outline" onClick={() => setModal(false)}>Отмена</Button></>}>
        {err && <div className="erp-form-err">{err}</div>}
        <Field label="Имя / название" required><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} autoFocus /></Field>
        <div className="erp-form-row">
          <Field label="Телефон"><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+7 7XX XXX XX XX" /></Field>
          <Field label="Категория"><Select value={form.categoryId} onChange={e => setForm({ ...form, categoryId: e.target.value })}><option value="">— без категории —</option>{(cats || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        </div>
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
    </div>
  );
}
