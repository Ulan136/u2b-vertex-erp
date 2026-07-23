'use client';
import * as React from 'react';
import { formatDate } from '@/lib/format';
import { useApi, apiSend } from '@/lib/api';
import { toast } from '@/lib/toast';
import { Card, Badge, Button, PageTitle, Modal, Field, Input, Textarea, Select, EmptyRow } from '@/components/ui';
import EntityHistory from '@/components/erp/EntityHistory';

type Task = { id: string; title: string; description?: string | null; assigneeId?: string | null; assigneeName?: string | null; createdByName?: string | null; dueDate?: string | null; status: string; completedAt?: string | null };
type User = { id: string; name: string };

const STATUS: Record<string, { label: string; tone: 'info' | 'warn' | 'ok' | 'neutral' | 'err' }> = {
  new: { label: '🆕 Новая', tone: 'info' }, accepted: { label: '📋 Принята', tone: 'warn' },
  in_progress: { label: '🔧 В работе', tone: 'err' }, done: { label: '✅ Готова', tone: 'ok' },
};
const STATUS_OPTS = [['new', '🆕 Новая'], ['accepted', '📋 Принята'], ['in_progress', '🔧 В работе'], ['done', '✅ Готова']];
// Блоки активных задач по статусам (как в старом экране)
const BLOCKS = [{ key: 'new', label: '🆕 Новые' }, { key: 'accepted', label: '📋 Принятые' }, { key: 'in_progress', label: '🔧 В работе' }];
const NEXT: Record<string, { to: string; label: string }> = {
  new: { to: 'accepted', label: 'Принять' }, accepted: { to: 'in_progress', label: 'В работу' }, in_progress: { to: 'done', label: 'Завершить' },
};
const dmy = (d?: string | null) => formatDate(d);
const today = () => new Date().toISOString().slice(0, 10);
const isOverdue = (t: Task) => t.status !== 'done' && t.dueDate && String(t.dueDate).slice(0, 10) < today();

const EMPTY = { id: '', title: '', description: '', assigneeId: '', dueDate: '', status: 'new' };

export default function TasksPage() {
  const [assignee, setAssignee] = React.useState('');
  const [q, setQ] = React.useState('');
  const [qd, setQd] = React.useState('');   // дебаунс поиска (300 мс, как в старом)
  React.useEffect(() => { const t = setTimeout(() => setQd(q), 300); return () => clearTimeout(t); }, [q]);
  const [doneOpen, setDoneOpen] = React.useState(false);   // секция «Готовые» — по умолчанию свёрнута
  const [modal, setModal] = React.useState(false);
  const [form, setForm] = React.useState<typeof EMPTY>(EMPTY);
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState('');

  const params = new URLSearchParams();
  if (assignee) params.set('assigneeId', assignee);
  if (qd.trim()) params.set('q', qd.trim());
  const { data: tasks, error, isLoading, mutate } = useApi<Task[]>('/api/v2/tasks' + (params.toString() ? '?' + params : ''));
  const { data: users } = useApi<User[]>('/api/v2/users');

  const all = tasks || [];
  const activeOf = (k: string) => all.filter(t => t.status === k);
  const activeCount = all.filter(t => t.status !== 'done').length;
  const doneList = all.filter(t => t.status === 'done');
  // Готовые — группировка по исполнителю, внутри сортировка по дате завершения (свежие сверху)
  const doneGroups: Record<string, Task[]> = {};
  for (const t of doneList) (doneGroups[t.assigneeName || 'Без исполнителя'] ||= []).push(t);
  Object.values(doneGroups).forEach(g => g.sort((a, b) => String(b.completedAt || '').localeCompare(String(a.completedAt || ''))));

  const openNew = () => { setForm(EMPTY); setErr(''); setModal(true); };
  const openEdit = (t: Task) => { setForm({ id: t.id, title: t.title, description: t.description || '', assigneeId: t.assigneeId || '', dueDate: t.dueDate ? String(t.dueDate).slice(0, 10) : '', status: t.status }); setErr(''); setModal(true); };

  async function save() {
    if (!form.title.trim()) { setErr('Введите название'); return; }
    setSaving(true); setErr('');
    const body: Record<string, unknown> = { title: form.title.trim(), description: form.description || null, assigneeId: form.assigneeId || null, dueDate: form.dueDate || null };
    if (form.id) body.status = form.status;   // ручной статус — только при редактировании
    try {
      if (form.id) await apiSend(`/api/v2/tasks/${form.id}`, 'PATCH', body);
      else await apiSend('/api/v2/tasks', 'POST', body);
      setModal(false); await mutate(); toast(form.id ? '✅ Задача обновлена' : '✅ Задача создана');
    } catch (e) { setErr((e as Error).message); } finally { setSaving(false); }
  }
  async function advance(t: Task) {
    const nx = NEXT[t.status]; if (!nx) return;
    try { await apiSend(`/api/v2/tasks/${t.id}`, 'PATCH', { status: nx.to }); await mutate(); toast('✅ ' + STATUS[nx.to].label); }
    catch (e) { toast('⚠️ ' + (e as Error).message); }
  }
  async function remove(t: Task) {
    if (!confirm(`Удалить задачу «${t.title}»?`)) return;
    try { await apiSend(`/api/v2/tasks/${t.id}`, 'DELETE'); await mutate(); toast('🗑️ Удалено'); }
    catch (e) { toast('⚠️ ' + (e as Error).message); }
  }

  const rowActive = (t: Task) => (
    <tr key={t.id}>
      <td><div className="erp-td-main">{t.title}</div>{t.description && <div className="erp-td-sub">{t.description}</div>}</td>
      <td>{t.assigneeName || <span className="erp-muted">не назначен</span>}</td>
      <td className="erp-muted" style={{ fontSize: 12 }}>{t.createdByName || '—'}</td>
      <td>{t.dueDate ? <span style={isOverdue(t) ? { color: '#dc2626', fontWeight: 600 } : undefined}>{dmy(t.dueDate)}{isOverdue(t) ? ' ⏰' : ''}</span> : '—'}</td>
      <td><Badge tone={STATUS[t.status]?.tone || 'neutral'}>{STATUS[t.status]?.label || t.status}</Badge></td>
      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
        {NEXT[t.status] && <Button variant="outline" onClick={() => advance(t)} style={{ fontSize: 12, padding: '4px 8px' }}>{NEXT[t.status].label}</Button>}
        <button className="erp-icon-btn" title="Изменить" onClick={() => openEdit(t)}>✏️</button>
        <button className="erp-icon-btn" title="Удалить" style={{ color: '#dc2626' }} onClick={() => remove(t)}>🗑️</button>
      </td>
    </tr>
  );
  const activeThead = <thead><tr><th>Задача</th><th>Исполнитель</th><th>Автор</th><th>Срок</th><th>Статус</th><th style={{ textAlign: 'right' }}>Действия</th></tr></thead>;

  return (
    <div>
      <PageTitle title="Задачи" sub={`Открытых: ${activeCount}`} action={<Button onClick={openNew}>+ Задача</Button>} />

      <Card className="erp-filters">
        <Select value={assignee} onChange={e => setAssignee(e.target.value)}>
          <option value="">Все исполнители</option>
          {(users || []).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </Select>
        <Input placeholder="🔍 Поиск по названию" value={q} onChange={e => setQ(e.target.value)} />
      </Card>

      {error ? <Card style={{ marginTop: 12 }}><EmptyRow>Нет доступа к задачам.</EmptyRow></Card>
        : isLoading ? <Card style={{ marginTop: 12 }}><EmptyRow>Загрузка…</EmptyRow></Card>
        : all.length === 0 ? <Card style={{ marginTop: 12 }}><EmptyRow>Задач нет. Нажмите «+ Задача».</EmptyRow></Card>
        : (
          <>
            {BLOCKS.map(b => {
              const items = activeOf(b.key);
              if (!items.length) return null;
              return (
                <Card style={{ marginTop: 12, padding: 0, overflowX: 'auto' }} key={b.key}>
                  <div className="erp-block-head">{b.label} <span className="erp-block-count">· {items.length}</span></div>
                  <table className="erp-table">{activeThead}<tbody>{items.map(rowActive)}</tbody></table>
                </Card>
              );
            })}
            {activeCount === 0 && <Card style={{ marginTop: 12 }}><EmptyRow>Активных задач нет — всё выполнено 🎉</EmptyRow></Card>}

            <Card style={{ marginTop: 12, padding: 0, overflowX: 'auto' }}>
              <button className="erp-block-head erp-block-toggle" onClick={() => setDoneOpen(o => !o)}>
                <span style={{ width: 14, display: 'inline-block' }}>{doneOpen ? '▾' : '▸'}</span> ✅ Готовые <span className="erp-block-count">· {doneList.length}</span>
              </button>
              {doneOpen && (doneList.length === 0
                ? <div className="erp-muted" style={{ padding: '10px 16px', fontSize: 13 }}>Нет готовых задач</div>
                : Object.entries(doneGroups).map(([name, items]) => (
                  <div key={name}>
                    <div className="erp-group-sub">👤 {name} <span className="erp-block-count">· {items.length}</span></div>
                    <table className="erp-table"><tbody>
                      {items.map(t => (
                        <tr key={t.id}>
                          <td className="erp-td-main">{t.title}{t.description && <div className="erp-td-sub">{t.description}</div>}</td>
                          <td className="erp-muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>✅ {dmy(t.completedAt)}</td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <button className="erp-icon-btn" title="Изменить" onClick={() => openEdit(t)}>✏️</button>
                            <button className="erp-icon-btn" title="Удалить" style={{ color: '#dc2626' }} onClick={() => remove(t)}>🗑️</button>
                          </td>
                        </tr>
                      ))}
                    </tbody></table>
                  </div>
                )))}
            </Card>
          </>
        )}

      <Modal open={modal} onClose={() => setModal(false)} title={form.id ? '✏️ Задача' : '➕ Новая задача'}
        footer={<><Button onClick={save} disabled={saving}>{saving ? 'Сохранение…' : 'Сохранить'}</Button><Button variant="outline" onClick={() => setModal(false)}>Отмена</Button></>}>
        {err && <div className="erp-form-err">{err}</div>}
        <Field label="Название" required><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Что нужно сделать" autoFocus /></Field>
        <Field label="Описание"><Textarea rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Подробности" /></Field>
        <div className="erp-form-row">
          <Field label="Исполнитель"><Select value={form.assigneeId} onChange={e => setForm({ ...form, assigneeId: e.target.value })}><option value="">— не назначен —</option>{(users || []).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
          <Field label="Срок"><Input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} /></Field>
        </div>
        {form.id && <Field label="Статус"><Select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>{STATUS_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>}
        {form.id && <EntityHistory entityType="task" entityId={form.id} />}
      </Modal>
    </div>
  );
}
