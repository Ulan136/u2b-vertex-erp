'use client';
import { useApi } from '@/lib/api';
import { Card, Badge, PageTitle, EmptyRow } from '@/components/ui';

type Person = { id: string; name: string; position?: string | null; role: string; phone?: string | null; email?: string | null; branchName?: string | null; isActive?: boolean };
const ROLE: Record<string, string> = { admin: 'Админ', director: 'Директор', accountant: 'Бухгалтер', manager: 'Менеджер', master: 'Мастер' };

export default function DirectoryPage() {
  const { data, error, isLoading } = useApi<Person[]>('/api/v2/employees/directory');
  const list = data || [];
  return (
    <div>
      <PageTitle title="Руководитель — команда" sub={`Пользователи системы · ${list.length}`} />
      <Card style={{ padding: 0, overflowX: 'auto' }}>
        {error ? <EmptyRow>Нет доступа.</EmptyRow> : isLoading ? <EmptyRow>Загрузка…</EmptyRow>
          : list.length === 0 ? <EmptyRow>Нет пользователей.</EmptyRow>
          : (
            <table className="erp-table">
              <thead><tr><th>ФИО</th><th>Должность</th><th>Роль</th><th>Филиал</th><th>Телефон</th><th>Email</th><th>Статус</th></tr></thead>
              <tbody>
                {list.map(p => (
                  <tr key={p.id}>
                    <td className="erp-td-main">{p.name}</td>
                    <td className="erp-muted" style={{ fontSize: 12 }}>{p.position || '—'}</td>
                    <td><Badge tone={p.role === 'director' || p.role === 'admin' ? 'info' : 'neutral'}>{ROLE[p.role] || p.role}</Badge></td>
                    <td style={{ fontSize: 12 }}>{p.branchName || '—'}</td>
                    <td style={{ fontSize: 12 }}>{p.phone || '—'}</td>
                    <td className="erp-muted" style={{ fontSize: 12 }}>{p.email || '—'}</td>
                    <td><Badge tone={p.isActive === false ? 'warn' : 'ok'}>{p.isActive === false ? 'Неактивен' : 'Активен'}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </Card>
    </div>
  );
}
