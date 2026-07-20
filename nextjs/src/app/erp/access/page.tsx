'use client';
import * as React from 'react';
import { useApi, apiSend } from '@/lib/api';
import { toast } from '@/lib/toast';
import { Card, PageTitle, EmptyRow } from '@/components/ui';
import { SCREEN_KEYS, SCREEN_LABELS, ROLES, ROLE_LABELS_RU, isScreenAllowed, type PermRow } from '@/server/dto/permissions.dto';

export default function AccessPage() {
  const { data, error, isLoading, mutate } = useApi<PermRow[]>('/api/v2/role-permissions');
  const perms = data || [];

  async function toggle(role: string, screenKey: string, allowed: boolean) {
    // оптимистично
    const next = perms.filter(p => !(p.role === role && p.screenKey === screenKey));
    next.push({ role, screenKey, allowed });
    mutate(next, { revalidate: false });
    try {
      await apiSend('/api/v2/role-permissions', 'POST', { role, screenKey, allowed });
      toast(allowed ? '✅ Доступ открыт' : '🚫 Доступ закрыт');
      mutate();
    } catch (e) { toast('⚠️ ' + (e as Error).message); mutate(); }
  }

  return (
    <div>
      <PageTitle title="Доступы" sub="Кто какие разделы видит. Админ — всегда полный доступ. Пусто = разрешено по умолчанию." />
      <Card style={{ padding: 0, overflowX: 'auto' }}>
        {error ? <EmptyRow>Нет доступа к настройке прав.</EmptyRow>
          : isLoading ? <EmptyRow>Загрузка…</EmptyRow>
          : (
            <table className="erp-table erp-matrix">
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', minWidth: 170 }}>Экран</th>
                  {ROLES.map(r => <th key={r} style={{ textAlign: 'center' }}>{ROLE_LABELS_RU[r]}</th>)}
                </tr>
              </thead>
              <tbody>
                {SCREEN_KEYS.map(sk => (
                  <tr key={sk}>
                    <td style={{ textAlign: 'left' }}>{SCREEN_LABELS[sk]}</td>
                    {ROLES.map(role => {
                      const isAdmin = role === 'admin';
                      const allowed = isAdmin ? true : isScreenAllowed(role, sk, perms);
                      return (
                        <td key={role} style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={allowed}
                            disabled={isAdmin}
                            title={isAdmin ? 'Админ — всегда полный доступ' : ''}
                            onChange={e => toggle(role, sk, e.target.checked)}
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
        Права применяются и в меню, и на сервере (API). Изменения сохраняются сразу.
      </p>
    </div>
  );
}
