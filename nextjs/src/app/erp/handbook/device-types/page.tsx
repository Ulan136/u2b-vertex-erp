'use client';
import * as React from 'react';
import { useApi, apiSend } from '@/lib/api';
import { toast } from '@/lib/toast';
import { Card, Badge, Button, PageTitle, Modal, Field, Input, Select, EmptyRow } from '@/components/ui';

type DeviceType = { id: string; name: string; usageCount: number; lastUsedAt?: string | null; createdAt?: string | null };

const MANAGE_ROLES = ['admin', 'manager'];
const dmy = (d?: string | null) => (d ? String(d).slice(0, 10).split('-').reverse().join('.') : '—');
// нормализация для клиентского поиска (совпадает с сервером: кириллица к/в/с → k/b/c)
const normKey = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase().replace(/с/g, 'c').replace(/в/g, 'b').replace(/к/g, 'k');

export default function DeviceTypesPage() {
  const { data, error, isLoading, mutate } = useApi<DeviceType[]>('/api/v2/device-types');
  const { data: session } = useApi<{ user?: { role?: string } }>('/api/auth/session');
  const canManage = MANAGE_ROLES.includes(session?.user?.role || '');

  const [q, setQ] = React.useState('');
  const [addOpen, setAddOpen] = React.useState(false);
  const [af, setAf] = React.useState({ name: '', err: '', saving: false });
  const [ren, setRen] = React.useState<{ row: DeviceType | null; name: string; err: string; saving: boolean }>({ row: null, name: '', err: '', saving: false });
  const [mrg, setMrg] = React.useState<{ row: DeviceType | null; toId: string; err: string; saving: boolean }>({ row: null, toId: '', err: '', saving: false });

  const all = data || [];
  const list = React.useMemo(() => {
    const k = normKey(q);
    return !k ? all : all.filter(t => normKey(t.name).includes(k));
  }, [all, q]);

  async function add() {
    if (!af.name.trim()) { setAf(s => ({ ...s, err: 'Введите название' })); return; }
    setAf(s => ({ ...s, saving: true, err: '' }));
    try { await apiSend('/api/v2/device-types', 'POST', { name: af.name.trim() }); setAddOpen(false); setAf({ name: '', err: '', saving: false }); await mutate(); toast('✅ Тип добавлен'); }
    catch (e) { setAf(s => ({ ...s, err: (e as Error).message, saving: false })); }
  }
  async function rename() {
    if (!ren.row) return;
    if (!ren.name.trim()) { setRen(s => ({ ...s, err: 'Введите название' })); return; }
    setRen(s => ({ ...s, saving: true, err: '' }));
    try { await apiSend(`/api/v2/device-types/${ren.row.id}`, 'PATCH', { name: ren.name.trim() }); setRen({ row: null, name: '', err: '', saving: false }); await mutate(); toast('✅ Переименовано'); }
    catch (e) { setRen(s => ({ ...s, err: (e as Error).message, saving: false })); }
  }
  async function merge() {
    if (!mrg.row) return;
    if (!mrg.toId) { setMrg(s => ({ ...s, err: 'Выберите тип-приёмник' })); return; }
    setMrg(s => ({ ...s, saving: true, err: '' }));
    try { const r = await apiSend<{ moved: number; to: string }>('/api/v2/device-types/merge', 'POST', { fromId: mrg.row.id, toId: mrg.toId }); setMrg({ row: null, toId: '', err: '', saving: false }); await mutate(); toast(`✅ Объединено → «${r.to}» (перенесено записей: ${r.moved})`); }
    catch (e) { setMrg(s => ({ ...s, err: (e as Error).message, saving: false })); }
  }
  async function del(t: DeviceType) {
    if (!confirm(`Удалить тип «${t.name}»?`)) return;
    try { await apiSend(`/api/v2/device-types/${t.id}`, 'DELETE'); await mutate(); toast('🗑️ Удалено'); }
    catch (e) { toast('⚠️ ' + (e as Error).message); }
  }

  return (
    <div>
      <PageTitle title="Типы приборов" sub={`Самообучающийся справочник · типов: ${all.length}`}
        action={canManage ? <Button onClick={() => { setAf({ name: '', err: '', saving: false }); setAddOpen(true); }}>+ Тип</Button> : undefined} />

      <Card className="erp-filters">
        <Input placeholder="🔍 Поиск (свк-15, CBK-15…)" value={q} onChange={e => setQ(e.target.value)} />
        <Badge tone="info">найдено: {list.length}</Badge>
      </Card>

      <Card style={{ marginTop: 12, padding: 0, overflowX: 'auto' }}>
        {error ? <EmptyRow>Нет доступа к справочнику.</EmptyRow>
          : isLoading ? <EmptyRow>Загрузка…</EmptyRow>
          : list.length === 0 ? <EmptyRow>Типов нет.</EmptyRow>
          : (
            <table className="erp-table">
              <thead><tr><th>Название</th><th style={{ textAlign: 'right' }}>Использований</th><th>Последнее</th>{canManage && <th style={{ textAlign: 'right' }}></th>}</tr></thead>
              <tbody>
                {list.map(t => (
                  <tr key={t.id}>
                    <td className="erp-td-main">{t.name}</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{t.usageCount}</td>
                    <td className="erp-muted" style={{ fontSize: 12 }}>{dmy(t.lastUsedAt)}</td>
                    {canManage && (
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button className="erp-icon-btn" title="Переименовать" onClick={() => setRen({ row: t, name: t.name, err: '', saving: false })}>✏️</button>
                        <button className="erp-icon-btn" title="Объединить с другим типом" onClick={() => setMrg({ row: t, toId: '', err: '', saving: false })}>🔀</button>
                        <button className="erp-icon-btn" title="Удалить (без использований)" style={{ color: '#dc2626' }} onClick={() => del(t)}>🗑️</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </Card>

      {/* Добавить */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="➕ Новый тип прибора"
        footer={<><Button onClick={add} disabled={af.saving}>{af.saving ? '…' : 'Создать'}</Button><Button variant="outline" onClick={() => setAddOpen(false)}>Отмена</Button></>}>
        {af.err && <div className="erp-form-err">{af.err}</div>}
        <Field label="Название" required><Input value={af.name} onChange={e => setAf({ ...af, name: e.target.value })} placeholder="Напр.: СГВ-15" autoFocus /></Field>
      </Modal>

      {/* Переименовать */}
      <Modal open={!!ren.row} onClose={() => setRen({ row: null, name: '', err: '', saving: false })} title="✏️ Переименовать тип"
        footer={<><Button onClick={rename} disabled={ren.saving}>{ren.saving ? '…' : 'Сохранить'}</Button><Button variant="outline" onClick={() => setRen({ row: null, name: '', err: '', saving: false })}>Отмена</Button></>}>
        {ren.err && <div className="erp-form-err">{ren.err}</div>}
        <div className="erp-muted" style={{ fontSize: 12, marginBottom: 8 }}>Прежнее написание сохранится как алиас — старые записи продолжат находиться.</div>
        <Field label="Название" required><Input value={ren.name} onChange={e => setRen({ ...ren, name: e.target.value })} autoFocus /></Field>
      </Modal>

      {/* Объединить */}
      <Modal open={!!mrg.row} onClose={() => setMrg({ row: null, toId: '', err: '', saving: false })} title="🔀 Объединить типы"
        footer={<><Button onClick={merge} disabled={mrg.saving}>{mrg.saving ? '…' : 'Объединить'}</Button><Button variant="outline" onClick={() => setMrg({ row: null, toId: '', err: '', saving: false })}>Отмена</Button></>}>
        {mrg.err && <div className="erp-form-err">{mrg.err}</div>}
        <div className="erp-muted" style={{ fontSize: 12, marginBottom: 8 }}>Записи из «<b>{mrg.row?.name}</b>» переедут на выбранный тип, счётчики сложатся, а «{mrg.row?.name}» сохранится как алиас и будет удалён.</div>
        <Field label="Оставить тип (приёмник)" required>
          <Select value={mrg.toId} onChange={e => setMrg({ ...mrg, toId: e.target.value })}>
            <option value="">— выберите —</option>
            {all.filter(t => t.id !== mrg.row?.id).map(t => <option key={t.id} value={t.id}>{t.name} ({t.usageCount})</option>)}
          </Select>
        </Field>
      </Modal>
    </div>
  );
}
