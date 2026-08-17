'use client';
import * as React from 'react';
import { useApi, apiSend } from '@/lib/api';
import { toast } from '@/lib/toast';
import { Card, Badge, Button, PageTitle, Modal, Field, Input, EmptyRow } from '@/components/ui';

type User = { id: string; name: string; email?: string | null; phone?: string | null; position?: string | null; role: string; isActive?: boolean };
const ROLE: Record<string, string> = { admin: 'Админ', director: 'Директор', accountant: 'Бухгалтер', manager: 'Менеджер', master: 'Мастер' };

// Логин пользователя = email, либо телефон (если email — тех.заглушка *@phone.local).
const loginOf = (u: User) => (u.email && !u.email.endsWith('@phone.local')) ? u.email : (u.phone || '— нет логина —');

// Генератор понятного пароля: буквы+цифры без похожих символов (0/O, 1/l/I).
function genPassword(len = 10): string {
  const abc = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  const rnd = new Uint32Array(len);
  (globalThis.crypto || window.crypto).getRandomValues(rnd);
  for (let i = 0; i < len; i++) s += abc[rnd[i] % abc.length];
  return s;
}

async function copyText(s: string) {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('no-clipboard');
    await navigator.clipboard.writeText(s); toast('📋 Пароль скопирован');
  } catch {
    const ta = document.createElement('textarea'); ta.value = s; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.focus(); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch { /* ignore */ }
    document.body.removeChild(ta); toast(ok ? '📋 Пароль скопирован' : '⚠️ Не удалось скопировать');
  }
}

export default function PasswordsPage() {
  const { data: session } = useApi<{ user?: { role?: string } }>('/api/auth/session');
  const isAdmin = session?.user?.role === 'admin';
  const { data: users, error, isLoading, mutate } = useApi<User[]>(isAdmin ? '/api/v2/users?all=1' : null);
  const { data: roleList } = useApi<{ key: string; label: string }[]>(isAdmin ? '/api/v2/roles' : null);
  const roleLabel = (k: string) => (roleList || []).find(r => r.key === k)?.label || ROLE[k] || k;

  const [target, setTarget] = React.useState<User | null>(null);
  const [pwd, setPwd] = React.useState('');
  const [show, setShow] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState('');
  const [done, setDone] = React.useState<{ name: string; pwd: string } | null>(null);

  const openReset = (u: User) => { setTarget(u); setPwd(''); setShow(true); setErr(''); };
  async function save() {
    if (!target) return;
    if (pwd.length < 4) { setErr('Пароль минимум 4 символа'); return; }
    setSaving(true); setErr('');
    try {
      await apiSend(`/api/v2/users/${target.id}/password`, 'POST', { password: pwd });
      setDone({ name: target.name, pwd });
      setTarget(null); await mutate();
    } catch (e) { setErr((e as Error).message); } finally { setSaving(false); }
  }

  if (session && !isAdmin) {
    return (
      <div>
        <PageTitle title="Управление паролями" />
        <Card><EmptyRow>🔒 Доступ только для администратора.</EmptyRow></Card>
      </div>
    );
  }

  const list = users || [];
  return (
    <div>
      <PageTitle title="🔑 Управление паролями" sub={`Всего пользователей: ${list.length} · только администратор`} />
      <Card className="erp-muted" style={{ fontSize: 12, marginBottom: 12 }}>
        ℹ️ Пароли хранятся в зашифрованном виде (bcrypt) — <b>текущий пароль показать нельзя</b> (это невозможно и небезопасно).
        Здесь можно <b>задать новый пароль</b>: введите свой или сгенерируйте, покажите глазком и передайте сотруднику.
      </Card>

      <Card className="erp-journal" style={{ padding: 0 }}>
        {error ? <EmptyRow>Нет доступа.</EmptyRow> : isLoading ? <EmptyRow>Загрузка…</EmptyRow> : list.length === 0 ? <EmptyRow>Нет пользователей.</EmptyRow> : (
          <table className="erp-table">
            <thead><tr><th>ФИО</th><th>Логин</th><th>Роль</th><th>Статус</th><th style={{ textAlign: 'right' }}>Пароль</th></tr></thead>
            <tbody>{list.map(u => (
              <tr key={u.id}>
                <td className="erp-td-main">{u.name}</td>
                <td style={{ fontSize: 12, fontFamily: 'ui-monospace, Consolas, monospace' }}>{loginOf(u)}</td>
                <td><Badge tone={u.role === 'admin' || u.role === 'director' ? 'info' : 'neutral'}>{roleLabel(u.role)}</Badge></td>
                <td><Badge tone={u.isActive === false ? 'warn' : 'ok'}>{u.isActive === false ? 'Неактивен' : 'Активен'}</Badge></td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <Button variant="outline" onClick={() => openReset(u)} style={{ fontSize: 12 }}>🔑 Задать новый пароль</Button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Card>

      {/* Модалка сброса пароля */}
      <Modal open={!!target} onClose={() => setTarget(null)} width={480}
        title={<span>🔑 Новый пароль — {target?.name}</span>}
        footer={<><Button onClick={save} disabled={saving || pwd.length < 4}>{saving ? 'Сохранение…' : '💾 Сохранить пароль'}</Button><Button variant="outline" onClick={() => setTarget(null)}>Отмена</Button></>}>
        {err && <div className="erp-form-err">{err}</div>}
        <div className="erp-muted" style={{ fontSize: 12, marginBottom: 8 }}>Логин: <b style={{ fontFamily: 'monospace' }}>{target ? loginOf(target) : ''}</b>. Текущий пароль недоступен — задаётся новый.</div>
        <Field label="Новый пароль (мин. 4 символа)">
          <div style={{ display: 'flex', gap: 6 }}>
            <Input type={show ? 'text' : 'password'} value={pwd} onChange={e => setPwd(e.target.value)} placeholder="введите или сгенерируйте" autoFocus style={{ fontFamily: 'monospace' }} />
            <button type="button" className="erp-icon-btn" title={show ? 'Скрыть' : 'Показать'} onClick={() => setShow(s => !s)}>{show ? '🙈' : '👁'}</button>
            <button type="button" className="erp-icon-btn" title="Копировать" onClick={() => pwd && copyText(pwd)}>📋</button>
          </div>
        </Field>
        <Button variant="outline" onClick={() => { setPwd(genPassword()); setShow(true); }} style={{ fontSize: 12, marginTop: 4 }}>🎲 Сгенерировать пароль</Button>
      </Modal>

      {/* Итог: показать заданный пароль один раз (для передачи сотруднику) */}
      <Modal open={!!done} onClose={() => setDone(null)} width={440}
        title={<span>✅ Пароль обновлён</span>}
        footer={<Button onClick={() => setDone(null)}>Готово</Button>}>
        <div style={{ fontSize: 13, marginBottom: 10 }}>Новый пароль для <b>{done?.name}</b> сохранён. Передайте его сотруднику — позже посмотреть будет нельзя.</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px' }}>
          <code style={{ fontSize: 16, fontWeight: 700, flex: 1, wordBreak: 'break-all' }}>{done?.pwd}</code>
          <Button variant="outline" onClick={() => done && copyText(done.pwd)} style={{ fontSize: 12 }}>📋 Копировать</Button>
        </div>
      </Modal>
    </div>
  );
}
