'use client';
import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { useApi, apiSend } from '@/lib/api';
import { toast } from '@/lib/toast';
import { Card, Badge, Button, PageTitle, Modal, Field, Input, Select, EmptyRow } from '@/components/ui';

type Cert = {
  id: string; source: string; fio?: string | null; address?: string | null; phone?: string | null;
  meterType?: string | null; serialNo?: string | null; yearMade?: number | null; waterType?: string | null;
  checkDate?: string | null; nextCheckDate?: string | null; stampNo?: string | null; readings?: string | number | null;
  result?: string | null; operStatus?: string | null; payStatus?: string | null; note?: string | null;
};

const SOURCES = ['САМИ', 'ВДК', 'ТЭЦ', 'Выездная', 'Первичная-КМ', 'Первичная-АК', 'Астана'];
const OPER = ['В работе', 'Готова к КТРМ', 'Внести в КТРМ', 'КТРМ 70%', 'Внесён в КТРМ'];
const dmy = (d?: string | null) => (d ? String(d).slice(0, 10).split('-').reverse().join('.') : '—');
const iso = (d?: string | null) => (d ? String(d).slice(0, 10) : '');
const operTone = (s?: string | null): 'ok' | 'warn' | 'info' | 'neutral' => s === 'Внесён в КТРМ' ? 'ok' : s === 'В работе' ? 'neutral' : 'warn';
const EMPTY = { id: '', fio: '', address: '', phone: '', meterType: '', serialNo: '', yearMade: '', waterType: 'х/в', checkDate: '', nextCheckDate: '', stampNo: '', readings: '', result: 'Годен', operStatus: 'В работе', payStatus: 'В ожидании', note: '' };

function CertsInner() {
  const sp = useSearchParams();
  const initial = sp.get('source');
  const [source, setSource] = React.useState(initial && SOURCES.includes(initial) ? initial : 'САМИ');
  const [q, setQ] = React.useState('');
  const { data: certs, error, isLoading, mutate } = useApi<Cert[]>(`/api/v2/certs?source=${encodeURIComponent(source)}&archived=false&type=cert`);
  const [modal, setModal] = React.useState(false);
  const [form, setForm] = React.useState<typeof EMPTY>(EMPTY);
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState('');

  const list = (certs || []).filter(c => !q.trim() || `${c.fio} ${c.address} ${c.serialNo}`.toLowerCase().includes(q.toLowerCase()));

  const openNew = () => { setForm(EMPTY); setErr(''); setModal(true); };
  const openEdit = (c: Cert) => { setForm({ id: c.id, fio: c.fio || '', address: c.address || '', phone: c.phone || '', meterType: c.meterType || '', serialNo: c.serialNo || '', yearMade: c.yearMade ? String(c.yearMade) : '', waterType: c.waterType || 'х/в', checkDate: iso(c.checkDate), nextCheckDate: iso(c.nextCheckDate), stampNo: c.stampNo || '', readings: c.readings != null ? String(c.readings) : '', result: c.result || 'Годен', operStatus: c.operStatus || 'В работе', payStatus: c.payStatus || 'В ожидании', note: c.note || '' }); setErr(''); setModal(true); };

  async function save() {
    if (!form.fio.trim()) { setErr('Укажите ФИО / объект'); return; }
    setSaving(true); setErr('');
    const body = { source, fio: form.fio.trim(), address: form.address || null, phone: form.phone || null, meterType: form.meterType || null, serialNo: form.serialNo || null, yearMade: form.yearMade ? Number(form.yearMade) : null, waterType: form.waterType, checkDate: form.checkDate || null, nextCheckDate: form.nextCheckDate || null, stampNo: form.stampNo || null, readings: form.readings || null, result: form.result, operStatus: form.operStatus, payStatus: form.payStatus, note: form.note || null, docType: 'cert' };
    try {
      if (form.id) await apiSend(`/api/v2/certs/${form.id}`, 'PATCH', body);
      else await apiSend('/api/v2/certs', 'POST', body);
      setModal(false); await mutate(); toast(form.id ? '✅ Сертификат обновлён' : '✅ Сертификат добавлен');
    } catch (e) { setErr((e as Error).message); } finally { setSaving(false); }
  }
  async function remove(c: Cert) {
    if (!confirm(`Удалить сертификат «${c.fio}»?`)) return;
    try { await apiSend(`/api/v2/certs/${c.id}`, 'DELETE'); await mutate(); toast('🗑️ Удалено'); }
    catch (e) { toast('⚠️ ' + (e as Error).message); }
  }

  return (
    <div>
      <PageTitle title="Поверка — сертификаты" sub={`Направление: ${source} · записей: ${list.length}`} action={<Button onClick={openNew}>+ Сертификат</Button>} />

      <Card className="erp-filters">
        <div className="erp-chips">{SOURCES.map(s => <button key={s} className={`erp-chip${source === s ? ' on' : ''}`} onClick={() => setSource(s)}>{s}</button>)}</div>
        <Input placeholder="🔍 ФИО, адрес, № счётчика" value={q} onChange={e => setQ(e.target.value)} />
      </Card>

      <Card style={{ marginTop: 12, padding: 0, overflowX: 'auto' }}>
        {error ? <EmptyRow>Нет доступа к этому направлению.</EmptyRow> : isLoading ? <EmptyRow>Загрузка…</EmptyRow>
          : list.length === 0 ? <EmptyRow>Записей нет. Нажмите «+ Сертификат».</EmptyRow>
          : (
            <table className="erp-table">
              <thead><tr><th>ФИО / объект</th><th>Адрес</th><th>Тип · № счётчика</th><th>Поверка</th><th>След.</th><th>Клеймо</th><th>Результат</th><th>Оплата</th><th>Статус</th><th style={{ textAlign: 'right' }}></th></tr></thead>
              <tbody>
                {list.map(c => (
                  <tr key={c.id}>
                    <td className="erp-td-main">{c.fio}</td>
                    <td style={{ fontSize: 12 }}>{c.address || '—'}</td>
                    <td style={{ fontSize: 12 }}>{c.meterType || '—'} <span className="erp-muted">{c.serialNo || ''}</span></td>
                    <td style={{ fontSize: 12 }}>{dmy(c.checkDate)}</td>
                    <td style={{ fontSize: 12 }}>{dmy(c.nextCheckDate)}</td>
                    <td style={{ fontSize: 12 }}>{c.stampNo || '—'}</td>
                    <td><Badge tone={c.result === 'Не годен' ? 'err' : 'ok'}>{c.result || 'Годен'}</Badge></td>
                    <td><Badge tone={c.payStatus === 'Оплачено' ? 'ok' : 'warn'}>{c.payStatus === 'Оплачено' ? '✓' : '⏳'}</Badge></td>
                    <td><Badge tone={operTone(c.operStatus)}>{c.operStatus}</Badge></td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button className="erp-icon-btn" title="Изменить" onClick={() => openEdit(c)}>✏️</button>
                      <button className="erp-icon-btn" title="Удалить" style={{ color: '#dc2626' }} onClick={() => remove(c)}>🗑️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </Card>

      <Modal open={modal} onClose={() => setModal(false)} title={form.id ? '✏️ Сертификат' : `➕ Сертификат · ${source}`} width={640}
        footer={<><Button onClick={save} disabled={saving}>{saving ? 'Сохранение…' : 'Сохранить'}</Button><Button variant="outline" onClick={() => setModal(false)}>Отмена</Button></>}>
        {err && <div className="erp-form-err">{err}</div>}
        <div className="erp-form-row">
          <Field label="ФИО / объект" required><Input value={form.fio} onChange={e => setForm({ ...form, fio: e.target.value })} autoFocus /></Field>
          <Field label="Телефон"><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></Field>
        </div>
        <Field label="Адрес"><Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></Field>
        <div className="erp-form-row">
          <Field label="Тип прибора"><Input value={form.meterType} onChange={e => setForm({ ...form, meterType: e.target.value })} /></Field>
          <Field label="Заводской номер"><Input value={form.serialNo} onChange={e => setForm({ ...form, serialNo: e.target.value })} /></Field>
        </div>
        <div className="erp-form-row">
          <Field label="Год выпуска"><Input type="number" value={form.yearMade} onChange={e => setForm({ ...form, yearMade: e.target.value })} /></Field>
          <Field label="Вода"><Select value={form.waterType} onChange={e => setForm({ ...form, waterType: e.target.value })}><option>х/в</option><option>г/в</option></Select></Field>
        </div>
        <div className="erp-form-row">
          <Field label="Дата поверки"><Input type="date" value={form.checkDate} onChange={e => setForm({ ...form, checkDate: e.target.value })} /></Field>
          <Field label="Следующая поверка"><Input type="date" value={form.nextCheckDate} onChange={e => setForm({ ...form, nextCheckDate: e.target.value })} /></Field>
        </div>
        <div className="erp-form-row">
          <Field label="Номер клейма"><Input value={form.stampNo} onChange={e => setForm({ ...form, stampNo: e.target.value })} /></Field>
          <Field label="Показания, м³"><Input type="number" value={form.readings} onChange={e => setForm({ ...form, readings: e.target.value })} /></Field>
        </div>
        <div className="erp-form-row">
          <Field label="Результат"><Select value={form.result} onChange={e => setForm({ ...form, result: e.target.value })}><option>Годен</option><option>Не годен</option></Select></Field>
          <Field label="Оплата"><Select value={form.payStatus} onChange={e => setForm({ ...form, payStatus: e.target.value })}><option>В ожидании</option><option>Оплачено</option></Select></Field>
        </div>
        <Field label="Статус"><Select value={form.operStatus} onChange={e => setForm({ ...form, operStatus: e.target.value })}>{OPER.map(o => <option key={o}>{o}</option>)}</Select></Field>
        <Field label="Примечание"><Input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} /></Field>
      </Modal>
    </div>
  );
}

export default function CertsPage() {
  return <React.Suspense fallback={<div className="erp-muted" style={{ padding: 20 }}>Загрузка…</div>}><CertsInner /></React.Suspense>;
}
