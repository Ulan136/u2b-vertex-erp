'use client';
import * as React from 'react';
import { useApi, apiSend } from '@/lib/api';
import { toast } from '@/lib/toast';
import { Card, Badge, Button, PageTitle, Modal, Field, Input, Select, EmptyRow } from '@/components/ui';
import { INVOICE_TYPES } from '@/server/dto/branches.dto';

type Branch = { id: string; name: string; city?: string | null; address?: string | null; invoiceType?: string | null; isHead?: boolean; isActive?: boolean };
const EMPTY = { id: '', name: '', city: '', address: '', invoiceType: 'Каспи', isHead: false, isActive: true };

export default function BranchesPage() {
  const { data, error, isLoading, mutate } = useApi<Branch[]>('/api/v2/branches?all=1');
  const list = data || [];
  const [modal, setModal] = React.useState(false);
  const [f, setF] = React.useState<typeof EMPTY>(EMPTY);
  const [err, setErr] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  const openNew = () => { setF(EMPTY); setErr(''); setModal(true); };
  const openEdit = (b: Branch) => { setF({ id: b.id, name: b.name, city: b.city || '', address: b.address || '', invoiceType: b.invoiceType || 'Каспи', isHead: !!b.isHead, isActive: b.isActive !== false }); setErr(''); setModal(true); };

  async function save() {
    if (!f.name.trim()) { setErr('Введите название'); return; }
    setSaving(true); setErr('');
    const body = { name: f.name.trim(), city: f.city || null, address: f.address || null, invoiceType: f.invoiceType, isHead: f.isHead, ...(f.id ? { isActive: f.isActive } : {}) };
    try {
      if (f.id) await apiSend(`/api/v2/branches/${f.id}`, 'PATCH', body);
      else await apiSend('/api/v2/branches', 'POST', body);
      setModal(false); await mutate(); toast('✅ Сохранено');
    } catch (e) { setErr((e as Error).message); } finally { setSaving(false); }
  }
  async function makeHead(b: Branch) {
    if (b.isHead) return;
    try { await apiSend(`/api/v2/branches/${b.id}`, 'PATCH', { isHead: true }); await mutate(); toast('✅ Головной: ' + b.name); }
    catch (e) { toast('⚠️ ' + (e as Error).message); }
  }
  async function remove(b: Branch) {
    if (!confirm(`Удалить филиал «${b.name}»?`)) return;
    try { await apiSend(`/api/v2/branches/${b.id}`, 'DELETE'); await mutate(); toast('🗑 Удалено'); }
    catch (e) { toast('⚠️ ' + (e as Error).message); }
  }

  return (
    <div>
      <PageTitle title="Филиалы" sub="Головной + региональные. Ровно один головной; заявки без филиала считаются его." action={<Button onClick={openNew}>+ Филиал</Button>} />
      <Card className="erp-journal" style={{ padding: 0 }}>
        {error ? <EmptyRow>Нет доступа.</EmptyRow> : isLoading ? <EmptyRow>Загрузка…</EmptyRow> : list.length === 0 ? <EmptyRow>Филиалов нет. Нажмите «+ Филиал».</EmptyRow> : (
          <table className="erp-table">
            <thead><tr><th>Название</th><th>Город</th><th>Счёт</th><th>Тип</th><th>Статус</th><th style={{ textAlign: 'right' }}></th></tr></thead>
            <tbody>{list.map(b => (
              <tr key={b.id} style={b.isActive === false ? { opacity: .55 } : undefined}>
                <td className="erp-td-main">{b.name}</td>
                <td>{b.city || '—'}</td>
                <td style={{ fontSize: 12 }}>{b.invoiceType || '—'}</td>
                <td>{b.isHead ? <Badge tone="info">Головной</Badge> : <Badge tone="neutral">Филиал</Badge>}</td>
                <td><Badge tone={b.isActive === false ? 'warn' : 'ok'}>{b.isActive === false ? 'Неактивен' : 'Активен'}</Badge></td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {!b.isHead && <button className="erp-icon-btn" title="Сделать головным" onClick={() => makeHead(b)}>⭐</button>}
                  <button className="erp-icon-btn" title="Изменить" onClick={() => openEdit(b)}>✏️</button>
                  {!b.isHead && <button className="erp-icon-btn" title="Удалить" style={{ color: '#dc2626' }} onClick={() => remove(b)}>🗑️</button>}
                </td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Card>

      <Modal open={modal} onClose={() => setModal(false)} title={f.id ? '✏️ Филиал' : '➕ Новый филиал'} width={520}
        footer={<><Button onClick={save} disabled={saving}>{saving ? '…' : 'Сохранить'}</Button><Button variant="outline" onClick={() => setModal(false)}>Отмена</Button></>}>
        {err && <div className="erp-form-err">{err}</div>}
        <div className="erp-form-row">
          <Field label="Название" required><Input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="напр. Тараз" /></Field>
          <Field label="Город"><Input value={f.city} onChange={e => setF({ ...f, city: e.target.value })} placeholder="напр. Тараз" /></Field>
        </div>
        <Field label="Адрес"><Input value={f.address} onChange={e => setF({ ...f, address: e.target.value })} placeholder="улица, дом, офис" /></Field>
        <div className="erp-form-row">
          <Field label="Счёт (тип оплаты)"><Select value={f.invoiceType} onChange={e => setF({ ...f, invoiceType: e.target.value })}>{INVOICE_TYPES.map(t => <option key={t}>{t}</option>)}</Select></Field>
          <Field label="Тип филиала"><Select value={f.isHead ? 'head' : 'branch'} onChange={e => setF({ ...f, isHead: e.target.value === 'head' })}><option value="branch">Филиал</option><option value="head">Головной</option></Select></Field>
        </div>
        {f.isHead && <div className="erp-muted" style={{ fontSize: 12, marginBottom: 8 }}>⭐ Станет головным — у остальных флаг снимется (головной всегда один).</div>}
        {f.id && <label className="erp-check"><input type="checkbox" checked={f.isActive} onChange={e => setF({ ...f, isActive: e.target.checked })} /> Активен</label>}
      </Modal>
    </div>
  );
}
