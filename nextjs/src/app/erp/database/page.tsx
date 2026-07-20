'use client';
import * as React from 'react';
import { useApi } from '@/lib/api';
import { Card, Badge, PageTitle, EmptyRow } from '@/components/ui';

type Cert = { id: string; source: string; fio?: string | null; address?: string | null; serialNo?: string | null; checkDate?: string | null; nextCheckDate?: string | null };
const dmy = (d?: string | null) => (d ? String(d).slice(0, 10).split('-').reverse().join('.') : '—');
const today = () => new Date().toISOString().slice(0, 10);

export default function DatabasePage() {
  const [tab, setTab] = React.useState<'deadlines' | 'archive'>('deadlines');
  const { data: active, isLoading: l1, error } = useApi<Cert[]>('/api/v2/certs?archived=false&type=cert');
  const { data: archived, isLoading: l2 } = useApi<Cert[]>('/api/v2/certs?archived=true&type=cert');

  const deadlines = (active || []).filter(c => c.nextCheckDate).sort((a, b) => String(a.nextCheckDate).localeCompare(String(b.nextCheckDate)));
  const t = today();

  return (
    <div>
      <PageTitle title="База данных" sub="Сроки поверки счётчиков и архив" />
      <Card className="erp-filters"><div className="erp-chips">
        <button className={`erp-chip${tab === 'deadlines' ? ' on' : ''}`} onClick={() => setTab('deadlines')}>⏰ Сроки счётчиков</button>
        <button className={`erp-chip${tab === 'archive' ? ' on' : ''}`} onClick={() => setTab('archive')}>🗄 Архив ({(archived || []).length})</button>
      </div></Card>

      <Card style={{ marginTop: 12, padding: 0, overflowX: 'auto' }}>
        {error ? <EmptyRow>Нет доступа.</EmptyRow> : tab === 'deadlines' ? (
          l1 ? <EmptyRow>Загрузка…</EmptyRow> : deadlines.length === 0 ? <EmptyRow>Нет записей с датой следующей поверки.</EmptyRow> : (
            <table className="erp-table">
              <thead><tr><th>ФИО / объект</th><th>Адрес</th><th>№ счётчика</th><th>Направление</th><th>Поверка</th><th>Следующая</th><th>Статус срока</th></tr></thead>
              <tbody>{deadlines.map(c => {
                const overdue = String(c.nextCheckDate).slice(0, 10) < t;
                const soon = !overdue && String(c.nextCheckDate).slice(0, 10) < new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10);
                return <tr key={c.id}><td className="erp-td-main">{c.fio}</td><td style={{ fontSize: 12 }}>{c.address || '—'}</td><td style={{ fontSize: 12 }}>{c.serialNo || '—'}</td><td style={{ fontSize: 12 }}>{c.source}</td><td style={{ fontSize: 12 }}>{dmy(c.checkDate)}</td><td style={{ fontSize: 12, fontWeight: 600 }}>{dmy(c.nextCheckDate)}</td><td>{overdue ? <Badge tone="err">просрочено</Badge> : soon ? <Badge tone="warn">скоро</Badge> : <Badge tone="ok">в норме</Badge>}</td></tr>;
              })}</tbody>
            </table>
          )
        ) : (
          l2 ? <EmptyRow>Загрузка…</EmptyRow> : (archived || []).length === 0 ? <EmptyRow>Архив пуст.</EmptyRow> : (
            <table className="erp-table">
              <thead><tr><th>ФИО / объект</th><th>Адрес</th><th>№ счётчика</th><th>Направление</th><th>Дата поверки</th></tr></thead>
              <tbody>{(archived || []).map(c => <tr key={c.id}><td className="erp-td-main">{c.fio}</td><td style={{ fontSize: 12 }}>{c.address || '—'}</td><td style={{ fontSize: 12 }}>{c.serialNo || '—'}</td><td style={{ fontSize: 12 }}>{c.source}</td><td style={{ fontSize: 12 }}>{dmy(c.checkDate)}</td></tr>)}</tbody>
            </table>
          )
        )}
      </Card>
    </div>
  );
}
