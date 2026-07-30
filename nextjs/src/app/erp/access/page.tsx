'use client';
import * as React from 'react';
import { useApi, apiSend } from '@/lib/api';
import { toast } from '@/lib/toast';
import { Card, Button, Input, PageTitle, EmptyRow } from '@/components/ui';
import { SCREEN_KEYS, SCREEN_LABELS, ROLES, ROLE_LABELS_RU, isScreenAllowed, type PermRow } from '@/server/dto/permissions.dto';

type RoleRow = { key: string; label: string; isSystem?: boolean };
// Пока роли не загрузились — показываем системные (совпадают с сервером).
const FALLBACK_ROLES: RoleRow[] = ROLES.map(k => ({ key: k, label: ROLE_LABELS_RU[k], isSystem: true }));

export default function AccessPage() {
  const { data: permData, error, isLoading, mutate } = useApi<PermRow[]>('/api/v2/role-permissions');
  const { data: roleData, mutate: mutateRoles } = useApi<RoleRow[]>('/api/v2/roles');
  const perms = permData || [];
  const roles = roleData && roleData.length ? roleData : FALLBACK_ROLES;
  const [newRole, setNewRole] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  async function toggle(role: string, screenKey: string, allowed: boolean) {
    const next = perms.filter(p => !(p.role === role && p.screenKey === screenKey));
    next.push({ role, screenKey, allowed });
    mutate(next, { revalidate: false });
    try {
      await apiSend('/api/v2/role-permissions', 'POST', { role, screenKey, allowed });
      toast(allowed ? '✅ Доступ открыт' : '🚫 Доступ закрыт');
      mutate();
    } catch (e) { toast('⚠️ ' + (e as Error).message); mutate(); }
  }

  async function createRole() {
    const label = newRole.trim();
    if (label.length < 2) { toast('Введите название роли'); return; }
    setBusy(true);
    try { await apiSend('/api/v2/roles', 'POST', { label }); setNewRole(''); await mutateRoles(); toast('✅ Роль создана'); }
    catch (e) { toast('⚠️ ' + (e as Error).message); }
    finally { setBusy(false); }
  }
  async function renameRole(r: RoleRow) {
    const label = window.prompt('Новое название роли:', r.label);
    if (!label || label.trim() === r.label) return;
    try { await apiSend(`/api/v2/roles/${r.key}`, 'PATCH', { label: label.trim() }); await mutateRoles(); toast('✅ Переименовано'); }
    catch (e) { toast('⚠️ ' + (e as Error).message); }
  }
  async function deleteRole(r: RoleRow) {
    if (!window.confirm(`Удалить роль «${r.label}»?`)) return;
    try { await apiSend(`/api/v2/roles/${r.key}`, 'DELETE'); await Promise.all([mutateRoles(), mutate()]); toast('🗑 Роль удалена'); }
    catch (e) { toast('⚠️ ' + (e as Error).message); }
  }

  return (
    <div>
      <PageTitle title="Доступы и роли" sub="Создавайте роли и отмечайте, кто какие разделы видит. Админ — всегда полный доступ. Пусто = разрешено по умолчанию." />

      {/* Роли */}
      <Card style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--erp-muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 10 }}>Роли</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          {roles.map(r => (
            <span key={r.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid var(--erp-line)', borderRadius: 20, padding: '4px 6px 4px 12px', fontSize: 13, fontWeight: 600, background: '#fff' }}>
              {r.label}
              {r.isSystem
                ? <span title="Системная роль" style={{ fontSize: 11, color: '#94a3b8' }}>🔒</span>
                : (<>
                  <button className="erp-icon-btn" title="Переименовать" onClick={() => renameRole(r)}>✏️</button>
                  <button className="erp-icon-btn" title="Удалить" style={{ color: '#dc2626' }} onClick={() => deleteRole(r)}>🗑</button>
                </>)}
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, maxWidth: 440 }}>
          <Input placeholder="Название новой роли (напр. Кладовщик)" value={newRole} onChange={e => setNewRole(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') createRole(); }} />
          <Button onClick={createRole} disabled={busy} style={{ whiteSpace: 'nowrap' }}>➕ Создать роль</Button>
        </div>
      </Card>

      {/* Матрица доступов */}
      <Card style={{ padding: 0, overflowX: 'auto' }}>
        {error ? <EmptyRow>Нет доступа к настройке прав.</EmptyRow>
          : isLoading ? <EmptyRow>Загрузка…</EmptyRow>
          : (
            <table className="erp-table erp-matrix">
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', minWidth: 170 }}>Экран</th>
                  {roles.map(r => <th key={r.key} style={{ textAlign: 'center' }}>{r.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {SCREEN_KEYS.map(sk => (
                  <tr key={sk}>
                    <td style={{ textAlign: 'left' }}>{SCREEN_LABELS[sk]}</td>
                    {roles.map(r => {
                      const isAdmin = r.key === 'admin';
                      const allowed = isAdmin ? true : isScreenAllowed(r.key, sk, perms);
                      return (
                        <td key={r.key} style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={allowed}
                            disabled={isAdmin}
                            title={isAdmin ? 'Админ — всегда полный доступ' : ''}
                            onChange={e => toggle(r.key, sk, e.target.checked)}
                            style={{ width: 16, height: 16, cursor: isAdmin ? 'not-allowed' : 'pointer' }}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </Card>
      <p className="erp-muted" style={{ marginTop: 12, fontSize: 12 }}>
        Права применяются и в меню, и на сервере (API). Изменения сохраняются сразу. Особые полномочия (финансы, отмена продаж) остаются у системных ролей.
      </p>
    </div>
  );
}
