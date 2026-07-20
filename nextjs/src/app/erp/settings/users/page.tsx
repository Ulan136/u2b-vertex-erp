'use client';
import * as React from 'react';
import { useApi, apiSend } from '@/lib/api';
import { toast } from '@/lib/toast';
import { Card, Badge, Button, PageTitle, Modal, Field, Input, Select, EmptyRow } from '@/components/ui';

type User = { id: string; name: string; email?: string | null; phone?: string | null; position?: string | null; role: string; branchId?: string | null; isActive?: boolean };
type Branch = { id: string; name: string };
const ROLE: Record<string, string> = { admin: 'Админ', director: 'Директор', accountant: 'Бухгалтер', manager: 'Менеджер', master: 'Мастер' };
const ROLES = ['admin', 'director', 'accountant', 'manager', 'master'];
const EMPTY = { id: '', name: '', email: '', phone: '', position: '', role: 'manager', branchId: '', password: '' };

export default function UsersPage() {
  const { data: users, error, isLoading, mutate } = useApi<User[]>('/api/v2/users?all=1');
  const { data: branches } = useApi<Branch[]>('/api/v2/branches');
  const branchName = (id?: string | null) => (branches || []).find(b => b.id === id)?.name;
  const [modal, setModal] = React.useState(false);
  const [f, setF] = React.useState<typeof EMPTY>(EMPTY);
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState('');
  const list = users || [];

  const openNew = () => { setF(EMPTY); setErr(''); setModal(true); };
  const openEdit = (u: User) => { setF({ id: u.id, name: u.name, email: u.email || '', phone: u.phone || '', position: u.position || '', role: u.role, branchId: u.branchId || '', password: '' }); setErr(''); setModal(true); };
  async function save() {
    if (!f.name.trim()) { setErr('ФИО обязательно'); return; }
    if (!f.id && (!f.email.trim() || f.password.length < 4)) { setErr('Email и пароль (мин. 4) обязательны'); return; }
    setSaving(true); setErr('');
    const body: Record<string, unknown> = { name: f.name.trim(), phone: f.phone || null, position: f.position || null, role: f.role, branchId: f.branchId || null };
    if (!f.id) { body.email = f.email.trim(); body.password = f.password; }
    else if (f.password) body.password = f.password;
    try { if (f.id) await apiSend(`/api/v2/users/${f.id}`, 'PATCH', body); else await apiSend('/api/v2/users', 'POST', body); setModal(false); await mutate(); toast('✅ Сохранено'); }
    catch (e) { setErr((e as Error).message); } finally { setSaving(false); }
  }
  async function toggleActive(u: User) {
    try { await apiSend(`/api/v2/users/${u.id}`, 'PATCH', { isActive: !(u.isActive !== false) }); await mutate(); toast(u.isActive !== false ? '🚫 Деактивирован' : '✅ Активирован'); }
    catch (e) { toast('⚠️ ' + (e as Error).message); }
  }

  return (
    <div>
      <PageTitle title="Пользователи" sub={`Всего: ${list.length}`} action={<Button onClick={openNew}>+ Пользователь</Button>} />
      <Card style={{ padding: 0, overflowX: 'auto' }}>
        {error ? <EmptyRow>Нет доступа.</EmptyRow> : isLoading ? <EmptyRow>Загрузка…</EmptyRow> : list.length === 0 ? <EmptyRow>Нет пользователей.</EmptyRow> : (
          <table className="erp-table">
            <thead><tr><th>ФИО</th><th>Email</th><th>Телефон</th><th>Должность</th><th>Роль</th><th>Филиал</th><th>Статус</th><th style={{ textAlign: 'right' }}></th></tr></thead>
            <tbody>{list.map(u => (
              <tr key={u.id}>
                <td className="erp-td-main">{u.name}</td><td className="erp-muted" style={{ fontSize: 12 }}>{u.email}</td><td style={{ fontSize: 12 }}>{u.phone || '—'}</td>
                <td style={{ fontSize: 12 }}>{u.position || '—'}</td><td><Badge tone={u.role === 'admin' || u.role === 'director' ? 'info' : 'neutral'}>{ROLE[u.role] || u.role}</Badge></td>
                <td style={{ fontSize: 12 }}>{branchName(u.branchId) || '—'}</td>
                <td><Badge tone={u.isActive === false ? 'warn' : 'ok'}>{u.isActive === false ? 'Неактивен' : 'Активен'}</Badge></td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}><button className="erp-icon-btn" title="Изменить" onClick={() => openEdit(u)}>✏️</button><button className="erp-icon-btn" title={u.isActive === false ? 'Активировать' : 'Деактивировать'} onClick={() => toggleActive(u)}>{u.isActive === false ? '↩️' : '🚫'}</button></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Card>
      <Modal open={modal} onClose={() => setModal(false)} title={f.id ? '✏️ Пользователь' : '➕ Новый пользователь'} width={560}
        footer={<><Button onClick={save} disabled={saving}>{saving ? '…' : 'Сохранить'}</Button><Button variant="outline" onClick={() => setModal(false)}>Отмена</Button></>}>
        {err && <div className="erp-form-err">{err}</div>}
        <div className="erp-form-row"><Field label="ФИО" required><Input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field><Field label="Должность"><Input value={f.position} onChange={e => setF({ ...f, position: e.target.value })} /></Field></div>
        <div className="erp-form-row"><Field label="Email (логин)" required><Input value={f.email} onChange={e => setF({ ...f, email: e.target.value })} disabled={!!f.id} /></Field><Field label="Телефон"><Input value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} /></Field></div>
        <div className="erp-form-row"><Field label="Роль"><Select value={f.role} onChange={e => setF({ ...f, role: e.target.value })}>{ROLES.map(r => <option key={r} value={r}>{ROLE[r]}</option>)}</Select></Field><Field label="Филиал"><Select value={f.branchId} onChange={e => setF({ ...f, branchId: e.target.value })}><option value="">— головной —</option>{(branches || []).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field></div>
        <Field label={f.id ? 'Новый пароль (если менять)' : 'Пароль'} required={!f.id}><Input type="password" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} placeholder={f.id ? 'оставьте пустым' : 'мин. 4 символа'} /></Field>
      </Modal>
    </div>
  );
}
