'use client';
import * as React from 'react';
import { useApi } from '@/lib/api';
import { actionRu } from '@/server/dto/audit.dto';
import { formatDateTime } from '@/lib/format';

type Row = { id: string; userName?: string | null; action: string; details?: Record<string, unknown> | null; createdAt: string };
const dt = (s: string) => formatDateTime(s);

// Блок «История изменений» для карточек/модалок документов. На печатные формы
// НЕ выводится (используется только в UI-модалках).
export default function EntityHistory({ entityType, entityId }: { entityType: string; entityId: string }) {
  const { data } = useApi<{ items: Row[] }>(`/api/v2/audit?entityType=${entityType}&entityId=${entityId}&limit=50`);
  const items = data?.items || [];
  return (
    <div className="erp-eh">
      <div className="erp-eh-title">🕘 История изменений</div>
      {items.length === 0 ? <div className="erp-eh-empty">Записей нет (лог ведётся с момента запуска).</div> : (
        <ul className="erp-eh-list">
          {items.map(r => (
            <li key={r.id} className="erp-eh-row">
              <span className="erp-eh-dot" />
              <div className="erp-eh-body">
                <div><b>{actionRu(r.action)}</b> · {r.userName || '—'}</div>
                <div className="erp-eh-time">{dt(r.createdAt)}</div>
                {r.details && typeof r.details === 'object' && (
                  <div className="erp-eh-diff">
                    {Object.entries(r.details).map(([f, v]) => Array.isArray(v)
                      ? <div key={f}><span className="erp-muted">{f}:</span> {String(v[0] ?? '—')} → {String(v[1] ?? '—')}</div>
                      : <div key={f}><span className="erp-muted">{f}:</span> {String(v)}</div>)}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
