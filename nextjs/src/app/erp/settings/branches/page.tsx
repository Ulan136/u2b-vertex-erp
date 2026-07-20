'use client';
import { useApi } from '@/lib/api';
import { Card, Badge, PageTitle, EmptyRow } from '@/components/ui';

type Branch = { id: string; name: string; city?: string | null; isHead?: boolean };

export default function BranchesPage() {
  const { data, error, isLoading } = useApi<Branch[]>('/api/v2/branches');
  const list = data || [];
  return (
    <div>
      <PageTitle title="Филиалы" sub="Список филиалов (головной + региональные)" />
      <Card style={{ padding: 0 }}>
        {error ? <EmptyRow>Нет доступа.</EmptyRow> : isLoading ? <EmptyRow>Загрузка…</EmptyRow> : list.length === 0 ? <EmptyRow>Филиалов нет.</EmptyRow> : (
          <table className="erp-table">
            <thead><tr><th>Название</th><th>Город</th><th>Тип</th></tr></thead>
            <tbody>{list.map(b => (
              <tr key={b.id}><td className="erp-td-main">{b.name}</td><td>{b.city || '—'}</td><td>{b.isHead ? <Badge tone="info">Головной</Badge> : <Badge tone="neutral">Филиал</Badge>}</td></tr>
            ))}</tbody>
          </table>
        )}
      </Card>
      <p className="erp-muted" style={{ fontSize: 12, marginTop: 10 }}>Создание/правка филиалов пока в старом интерфейсе (Настройки → Филиалы).</p>
    </div>
  );
}
