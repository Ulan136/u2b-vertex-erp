'use client';
import * as React from 'react';
import { useApi, apiSend } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { toast } from '@/lib/toast';
import { Card, Badge, Button, PageTitle, Modal, Field, Input, Select, EmptyRow } from '@/components/ui';
import { SUPPORT_STATUSES, SUPPORT_SEVERITIES } from '@/server/dto/support.dto';
import { SCREEN_LABELS } from '@/server/dto/permissions.dto';

type Ticket = {
  id: string; ticketNo?: number | null; title: string; body: string;
  screen?: string | null; severity: string; status: string;
  branchId?: string | null; branchName?: string | null;
  createdBy?: string | null; createdByName?: string | null;
  createdAt?: string | null; answeredAt?: string | null; closedAt?: string | null;
};
type Message = { id: string; text: string; authorId?: string | null; authorName?: string | null; createdAt?: string | null };
type Detail = Ticket & { messages: Message[] };

const dt = (s?: string | null) => {
  if (!s) return '—';
  const d = new Date(s);
  return isNaN(d.getTime()) ? (formatDate(s) || '—')
    : `${formatDate(s)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const statusTone = (s: string): 'neutral' | 'ok' | 'warn' | 'info' =>
  s === 'Закрыта' ? 'neutral' : s === 'Отвечено' ? 'ok' : s === 'В работе' ? 'warn' : 'info';
const sevTone = (s: string) => s === 'Блокирует работу' ? '#dc2626' : s === 'Срочная' ? '#b45309' : '#64748b';

const EMPTY = { title: '', body: '', screen: '', severity: 'Обычная' as string };

export default function SupportPage() {
  const [fStatus, setFStatus] = React.useState('open');
  const [q, setQ] = React.useState('');
  const qs = new URLSearchParams();
  if (fStatus) qs.set('status', fStatus);
  if (q.trim()) qs.set('q', q.trim());
  const { data: list, isLoading, error, mutate } = useApi<Ticket[]>('/api/v2/support?' + qs);
  const { data: session } = useApi<{ user?: { id?: string; name?: string; role?: string } }>('/api/auth/session');
  const role = session?.user?.role || '';
  // Разбирать заявки (менять статус) может только админ; остальные пишут и читают.
  const canResolve = role === 'admin';

  // ── создание заявки ──
  const [modal, setModal] = React.useState(false);
  const [form, setForm] = React.useState(EMPTY);
  const [saving, setSaving] = React.useState(false);
  const submit = async () => {
    if (form.title.trim().length < 3) { toast('Опишите проблему в заголовке'); return; }
    if (form.body.trim().length < 5) { toast('Опишите, что произошло'); return; }
    setSaving(true);
    try {
      await apiSend('/api/v2/support', 'POST', {
        title: form.title.trim(), body: form.body.trim(),
        screen: form.screen || null, severity: form.severity,
      });
      setModal(false); setForm(EMPTY); await mutate();
      toast('✅ Заявка отправлена');
    } catch (e) { toast('❌ ' + (e instanceof Error ? e.message : 'Не удалось отправить')); }
    finally { setSaving(false); }
  };

  // ── карточка заявки с перепиской ──
  const [openId, setOpenId] = React.useState('');
  const { data: detail, mutate: mutateDetail } = useApi<Detail>(openId ? `/api/v2/support/${openId}` : null);
  const [reply, setReply] = React.useState('');
  const [sending, setSending] = React.useState(false);

  const sendReply = async () => {
    if (!reply.trim() || !openId) return;
    setSending(true);
    try {
      await apiSend(`/api/v2/support/${openId}/reply`, 'POST', { text: reply.trim() });
      setReply(''); await mutateDetail(); await mutate();
    } catch (e) { toast('❌ ' + (e instanceof Error ? e.message : 'Не отправилось')); }
    finally { setSending(false); }
  };

  const setStatus = async (status: string) => {
    if (!openId) return;
    try {
      await apiSend(`/api/v2/support/${openId}`, 'PATCH', { status });
      await mutateDetail(); await mutate();
      toast('Статус: ' + status);
    } catch (e) { toast('❌ ' + (e instanceof Error ? e.message : 'Не удалось')); }
  };

  const openCount = (list || []).filter(t => t.status !== 'Закрыта').length;

  return (
    <div>
      <PageTitle
        title="Поддержка"
        sub="Заявки по системе — вопросы, ошибки, пожелания"
        action={<Button onClick={() => { setForm(EMPTY); setModal(true); }}>+ Заявка</Button>}
      />

      <Card className="erp-filters" style={{ flexWrap: 'wrap', gap: 8 }}>
        <Select value={fStatus} onChange={e => setFStatus(e.target.value)}>
          <option value="open">Открытые</option>
          <option value="">Все</option>
          {SUPPORT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Input placeholder="🔍 Тема или текст…" value={q} onChange={e => setQ(e.target.value)} style={{ maxWidth: 240 }} />
        <span style={{ marginLeft: 'auto', fontSize: 12 }} className="erp-muted">
          Показано: <b>{(list || []).length}</b>{fStatus === 'open' ? '' : <> · открытых <b>{openCount}</b></>}
        </span>
      </Card>

      <Card className="erp-journal" style={{ marginTop: 8, padding: 0 }}>
        {error ? <EmptyRow>Нет доступа к поддержке.</EmptyRow>
          : isLoading ? <EmptyRow>Загрузка…</EmptyRow>
          : (list || []).length === 0 ? <EmptyRow>Заявок нет. Нажмите «+ Заявка».</EmptyRow>
          : (
            <table className="erp-table">
              <thead><tr>
                <th>№</th><th>Создана</th><th>Филиал</th><th>Тема</th><th>Раздел</th><th>Важность</th><th>Статус</th><th>Автор</th>
              </tr></thead>
              <tbody>{(list || []).map(t => (
                <tr key={t.id} onClick={() => { setOpenId(t.id); setReply(''); }} style={{ cursor: 'pointer' }}>
                  <td className="erp-muted" style={{ fontFamily: 'monospace' }}>{t.ticketNo ?? '—'}</td>
                  <td className="erp-muted" style={{ fontSize: 12 }}>{dt(t.createdAt)}</td>
                  <td style={{ fontSize: 12 }}>{t.branchName || '—'}</td>
                  <td className="erp-td-main">{t.title}</td>
                  <td className="erp-muted" style={{ fontSize: 12 }}>{t.screen || '—'}</td>
                  <td style={{ fontSize: 12, color: sevTone(t.severity) }}>{t.severity}</td>
                  <td><Badge tone={statusTone(t.status)}>{t.status}</Badge></td>
                  <td className="erp-muted" style={{ fontSize: 12 }}>{t.createdByName || '—'}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
      </Card>

      {/* Новая заявка */}
      <Modal open={modal} onClose={() => setModal(false)} title="🛟 Новая заявка в поддержку">
        <Field label="Что случилось — коротко">
          <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="напр. Не сохраняется сертификат в Астане" />
        </Field>
        <div className="erp-form-row">
          <Field label="Раздел системы">
            <Select value={form.screen} onChange={e => setForm({ ...form, screen: e.target.value })}>
              <option value="">— не указан —</option>
              {Object.entries(SCREEN_LABELS).map(([k, v]) => <option key={k} value={v}>{v}</option>)}
            </Select>
          </Field>
          <Field label="Важность">
            <Select value={form.severity} onChange={e => setForm({ ...form, severity: e.target.value })}>
              {SUPPORT_SEVERITIES.map(s => <option key={s}>{s}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Подробно: что делали, что ожидали, что получилось">
          <textarea
            className="erp-input"
            value={form.body}
            onChange={e => setForm({ ...form, body: e.target.value })}
            rows={6}
            placeholder={'Шаги: открыл «Поверка · Астана» → нажал «+ Сертификат» → заполнил → «Сохранить».\nОжидал: запись появится в списке.\nПолучил: ошибка «Нет доступа».'}
            style={{ width: '100%', resize: 'vertical' }}
          />
        </Field>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
          <Button variant="outline" onClick={() => setModal(false)}>Отмена</Button>
          <Button onClick={submit} disabled={saving}>{saving ? 'Отправляю…' : 'Отправить'}</Button>
        </div>
      </Modal>

      {/* Карточка заявки + переписка */}
      <Modal open={!!openId} onClose={() => setOpenId('')} title={detail ? `🛟 Заявка №${detail.ticketNo ?? ''} · ${detail.title}` : 'Заявка'}>
        {!detail ? <EmptyRow>Загрузка…</EmptyRow> : (
          <>
            <div className="erp-muted" style={{ fontSize: 12, marginBottom: 8 }}>
              {dt(detail.createdAt)} · {detail.createdByName || '—'}
              {detail.branchName ? ` · ${detail.branchName}` : ''}
              {detail.screen ? ` · ${detail.screen}` : ''}
              {' · '}<span style={{ color: sevTone(detail.severity) }}>{detail.severity}</span>
            </div>

            <Card style={{ background: 'var(--erp-bg-soft, #f8fafc)', whiteSpace: 'pre-wrap', fontSize: 13 }}>{detail.body}</Card>

            {canResolve && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
                <span className="erp-muted" style={{ fontSize: 12 }}>Статус:</span>
                <Select value={detail.status} onChange={e => setStatus(e.target.value)} style={{ maxWidth: 180 }}>
                  {SUPPORT_STATUSES.map(s => <option key={s}>{s}</option>)}
                </Select>
              </div>
            )}

            <div className="cert-sec-lbl" style={{ marginTop: 14 }}>💬 Переписка</div>
            {detail.messages.length === 0 ? (
              <div className="erp-muted" style={{ fontSize: 13 }}>Пока ответов нет.</div>
            ) : detail.messages.map(m => (
              <div key={m.id} style={{ borderLeft: '3px solid var(--erp-line)', padding: '4px 10px', margin: '8px 0' }}>
                <div className="erp-muted" style={{ fontSize: 11 }}>{m.authorName || '—'} · {dt(m.createdAt)}</div>
                <div style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{m.text}</div>
              </div>
            ))}

            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <textarea
                className="erp-input"
                value={reply}
                onChange={e => setReply(e.target.value)}
                rows={3}
                placeholder="Написать по заявке…"
                style={{ flex: 1, resize: 'vertical' }}
              />
              <Button onClick={sendReply} disabled={sending || !reply.trim()}>{sending ? '…' : 'Отправить'}</Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
