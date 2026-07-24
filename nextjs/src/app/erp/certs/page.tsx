'use client';
import * as React from 'react';
import { formatDate } from '@/lib/format';
import { useSearchParams } from 'next/navigation';
import { useApi, apiSend } from '@/lib/api';
import { toast } from '@/lib/toast';
import { Card, Badge, Button, PageTitle, Modal, Field, Input, Select, EmptyRow } from '@/components/ui';
import EntityHistory from '@/components/erp/EntityHistory';
import { getRecent, pushRecent, removeRecent, type RecentItem } from '@/lib/recent';

type Cert = {
  id: string; source: string; docType?: string | null; fio?: string | null; address?: string | null; phone?: string | null; client?: string | null;
  meterType?: string | null; serialNo?: string | null; yearMade?: number | null; waterType?: string | null;
  checkDate?: string | null; nextCheckDate?: string | null; stampNo?: string | null; sealType?: string | null; readings?: string | number | null;
  result?: string | null; operStatus?: string | null; payStatus?: string | null; invoiceType?: string | null; sentStatus?: string | null; note?: string | null; createdByName?: string | null;
};
type Product = { id: string; skuCode: string; name: string };
type Client = { id: string; name: string };
type DeviceTypeHit = { id: string; name: string; usageCount: number };

const SOURCES = ['САМИ', 'ВДК', 'ТЭЦ', 'Выездная', 'Первичная-КМ', 'Первичная-АК', 'Астана'];
const OPER = ['В работе', 'Готова к КТРМ', 'Внести в КТРМ', 'КТРМ 70%', 'Внесён в КТРМ'];
const PAY = ['В ожидании', 'Оплачено'];
const INV = ['Каспи', 'БЦК', 'Наличка', 'Каспи Голд'];
const SENT = ['Не отправлено', 'Запланировано', 'Отправлено'];
const dmy = (d?: string | null) => formatDate(d) || '—';
const iso = (d?: string | null) => (d ? String(d).slice(0, 10) : '');
const num = (v: unknown) => Number(v) || 0;
const operTone = (s?: string | null): 'ok' | 'warn' | 'info' | 'neutral' => s === 'Внесён в КТРМ' ? 'ok' : s === 'В работе' ? 'neutral' : 'warn';
const sentTone = (s?: string | null): 'ok' | 'warn' | 'info' => s === 'Отправлено' ? 'ok' : s === 'Запланировано' ? 'info' : 'warn';
const isTTE = (c: Cert) => /ттэ/i.test(c.note || '') || c.waterType === 'г/в';
const EMPTY = { id: '', fio: '', address: '', phone: '', client: '', meterType: '', serialNo: '', yearMade: '', waterType: 'х/в', checkDate: '', nextCheckDate: '', stampNo: '', sealType: 'СЛ', readings: '', result: 'Годен', operStatus: 'В работе', payStatus: 'В ожидании', invoiceType: 'Каспи', sentStatus: 'Не отправлено', note: '' };

const VOICE_CERT: Array<[keyof typeof EMPTY, string]> = [['fio', 'ФИО абонента'], ['address', 'Адрес'], ['serialNo', 'Номер счётчика'], ['stampNo', 'Номер клейма'], ['readings', 'Показания в кубометрах'], ['yearMade', 'Год выпуска'], ['phone', 'Телефон'], ['client', 'Клиент'], ['note', 'Примечание']];
const VOICE_IZV: Array<[keyof typeof EMPTY, string]> = [['fio', 'ФИО абонента'], ['address', 'Адрес'], ['serialNo', 'Заводской номер'], ['yearMade', 'Год выпуска'], ['phone', 'Телефон'], ['client', 'Клиент'], ['note', 'Примечание']];

// Аккордеон по дате поверки (свежие сверху), сворачиваемый.
function CertAccordion({ items, empty }: { items: Cert[]; empty: string }) {
  const groups = React.useMemo(() => {
    const g: Record<string, Cert[]> = {};
    items.forEach(c => { const k = iso(c.checkDate) || 'без даты'; (g[k] ||= []).push(c); });
    return Object.entries(g).sort((a, b) => b[0].localeCompare(a[0]));
  }, [items]);
  const [open, setOpen] = React.useState<Record<string, boolean>>({});
  if (items.length === 0) return <div className="erp-muted" style={{ padding: 8 }}>{empty}</div>;
  return (
    <div className="cert-acc">
      {groups.map(([day, list]) => (
        <div key={day} className="cert-acc-grp">
          <div className="cert-acc-head" onClick={() => setOpen(o => ({ ...o, [day]: !o[day] }))}>
            <span>{open[day] ? '▾' : '▸'} {dmy(day)}</span><span className="erp-muted">· {list.length}</span>
          </div>
          {open[day] && list.map(c => (
            <div key={c.id} className="cert-acc-row">
              <b>{c.fio}</b> <span className="erp-muted" style={{ fontSize: 12 }}>{c.address}</span>
              <span className="erp-muted" style={{ fontSize: 11, fontFamily: 'monospace' }}>{c.meterType} {c.serialNo}</span>
              <Badge tone={c.payStatus === 'Оплачено' ? 'ok' : 'warn'}>{c.payStatus}</Badge>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function CertsInner() {
  const sp = useSearchParams();
  const initial = sp.get('source');
  const [source, setSource] = React.useState(initial && SOURCES.includes(initial) ? initial : 'САМИ');
  const [docType, setDocType] = React.useState<'cert' | 'izv'>(sp.get('type') === 'izv' ? 'izv' : 'cert');
  const [q, setQ] = React.useState('');
  const [fOper, setFOper] = React.useState('');
  const [fPay, setFPay] = React.useState('');
  const [fInv, setFInv] = React.useState('');
  const [fSent, setFSent] = React.useState('');
  const [histDays, setHistDays] = React.useState('30');
  const [histFrom, setHistFrom] = React.useState('');
  const [histTo, setHistTo] = React.useState('');
  React.useEffect(() => {
    const s = sp.get('source'); if (s && SOURCES.includes(s)) setSource(s);
    const t = sp.get('type'); if (t === 'cert' || t === 'izv') setDocType(t);
  }, [sp]);
  const { data: certs, error, isLoading, mutate } = useApi<Cert[]>(`/api/v2/certs?source=${encodeURIComponent(source)}&archived=false&type=${docType}`);
  const { data: products } = useApi<Product[]>('/api/v2/products');
  const { data: clients } = useApi<Client[]>('/api/v2/clients');
  const [modal, setModal] = React.useState(false);
  const [form, setForm] = React.useState<typeof EMPTY>(EMPTY);
  const [cloneFrom, setCloneFrom] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState('');

  // Тип прибора — автоподсказка: 🕘 недавние (пустое поле) + справочник + склад.
  const { data: session } = useApi<{ user?: { id?: string } }>('/api/auth/session');
  const uid = session?.user?.id || null;
  const [meterOpen, setMeterOpen] = React.useState(false);
  const [meterIdx, setMeterIdx] = React.useState(-1);
  const [recentMeters, setRecentMeters] = React.useState<RecentItem[]>([]);
  React.useEffect(() => { if (modal) setRecentMeters(getRecent('meterType', uid)); }, [modal, uid]);
  const meterQuery = form.meterType.trim();
  const showRecentMeters = meterOpen && !meterQuery && recentMeters.length > 0;
  const { data: deviceHits } = useApi<DeviceTypeHit[]>(meterQuery ? `/api/v2/device-types?q=${encodeURIComponent(meterQuery)}` : null);
  const skuHits = React.useMemo(() => {
    const qq = meterQuery.toLowerCase();
    if (!qq) return [] as { label: string; value: string }[];
    const seen = new Set<string>();
    return (products || [])
      .filter(p => `${p.skuCode} ${p.name}`.toLowerCase().includes(qq) && !seen.has(p.name) && seen.add(p.name))
      .map(p => ({ label: `${p.skuCode} · ${p.name}`, value: p.name })).slice(0, 6);
  }, [products, meterQuery]);
  // Плоский список для клавиатуры = то, что реально показано: пустое поле → недавние, иначе → подсказки.
  const meterFlat = React.useMemo(() => (!meterQuery ? recentMeters.map(r => r.v) : [...(deviceHits || []).map(d => d.name), ...skuHits.map(s => s.value)]), [meterQuery, recentMeters, deviceHits, skuHits]);
  React.useEffect(() => { setMeterIdx(-1); }, [meterQuery]);
  const pickMeter = (value: string) => { setForm(f => ({ ...f, meterType: value })); setMeterOpen(false); setMeterIdx(-1); };
  const dropRecentMeter = (v: string) => setRecentMeters(removeRecent('meterType', uid, v));
  function meterKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { setMeterOpen(false); setMeterIdx(-1); return; }
    if (!meterOpen || meterFlat.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setMeterIdx(i => Math.min(i + 1, meterFlat.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setMeterIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && meterIdx >= 0) { e.preventDefault(); pickMeter(meterFlat[meterIdx]); }
  }

  // ── Голосовой ввод (Web Speech API, ru-RU) ──
  const recog = React.useRef<{ abort: () => void } | null>(null);
  const [voice, setVoice] = React.useState<{ open: boolean; hint: string; transcript: string; listening: boolean }>({ open: false, hint: '', transcript: '', listening: false });
  const voiceSupported = typeof window !== 'undefined' && !!((window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }).SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition);
  function applyVoice(key: keyof typeof EMPTY, text: string) {
    let v = text.trim();
    if (key === 'yearMade' || key === 'readings') v = v.replace(/[^\d.]/g, '');
    setForm(f => ({ ...f, [key]: v }));
  }
  function makeRecog() {
    const SR = (window as unknown as { SpeechRecognition?: new () => unknown; webkitSpeechRecognition?: new () => unknown }).SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: new () => unknown }).webkitSpeechRecognition;
    if (!SR) return null;
    const r = new SR() as { lang: string; interimResults: boolean; continuous: boolean; start: () => void; abort: () => void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };
    r.lang = 'ru-RU'; r.interimResults = true; r.continuous = false;
    return r;
  }
  function voiceField(key: keyof typeof EMPTY, hint: string) {
    if (!voiceSupported) { toast('⚠️ Голосовой ввод не поддерживается этим браузером'); return; }
    const r = makeRecog(); if (!r) return;
    recog.current = r;
    setVoice({ open: true, hint, transcript: '', listening: true });
    let finalText = '';
    r.onresult = (e) => { let t = ''; for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript; finalText = t; setVoice(v => ({ ...v, transcript: t })); };
    r.onend = () => { if (finalText) applyVoice(key, finalText); setVoice(v => ({ ...v, listening: false, open: false })); };
    r.onerror = () => setVoice(v => ({ ...v, listening: false, open: false }));
    r.start();
  }
  function voiceAll() {
    if (!voiceSupported) { toast('⚠️ Голосовой ввод не поддерживается этим браузером'); return; }
    const fields = docType === 'izv' ? VOICE_IZV : VOICE_CERT;
    const run = (idx: number) => {
      if (idx >= fields.length) { setVoice({ open: false, hint: '', transcript: '', listening: false }); toast('✅ Поля заполнены голосом'); return; }
      const [key, hint] = fields[idx];
      const r = makeRecog(); if (!r) return;
      recog.current = r;
      setVoice({ open: true, hint: `${hint} (${idx + 1}/${fields.length})`, transcript: '', listening: true });
      let finalText = '';
      r.onresult = (e) => { let t = ''; for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript; finalText = t; setVoice(v => ({ ...v, transcript: t })); };
      r.onend = () => { if (finalText) applyVoice(key, finalText); setTimeout(() => run(idx + 1), 700); };
      r.onerror = () => setTimeout(() => run(idx + 1), 300);
      r.start();
    };
    run(0);
  }
  function voiceStop() { try { recog.current?.abort(); } catch { /* noop */ } setVoice({ open: false, hint: '', transcript: '', listening: false }); }

  const isCert = docType === 'cert';
  const all = React.useMemo(() => certs || [], [certs]);
  // Фильтры Блока 1 (у извещений — статус отправки вместо оплаты/счёта отдельным полем).
  const list = all.filter(c => {
    if (q.trim() && !`${c.fio} ${c.address} ${c.serialNo}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (fOper && c.operStatus !== fOper) return false;
    if (fPay && c.payStatus !== fPay) return false;
    if (fInv && c.invoiceType !== fInv) return false;
    if (!isCert && fSent && (c.sentStatus || 'Не отправлено') !== fSent) return false;
    return true;
  });

  // Блоки 2–4 (по полному списку направления).
  const waiting = all.filter(c => c.payStatus !== 'Оплачено');
  const unfit = all.filter(c => c.result === 'Не годен');
  const histList = React.useMemo(() => {
    let arr = all;
    if (histFrom) arr = arr.filter(c => iso(c.checkDate) >= histFrom);
    if (histTo) arr = arr.filter(c => iso(c.checkDate) <= histTo);
    if (!histFrom && !histTo && histDays !== '0') {
      const d = new Date(); d.setDate(d.getDate() - Number(histDays)); const from = d.toISOString().slice(0, 10);
      arr = arr.filter(c => iso(c.checkDate) >= from);
    }
    return arr;
  }, [all, histFrom, histTo, histDays]);

  // Статистика.
  const stats = {
    total: all.length,
    ktrm: all.filter(c => c.operStatus === 'Внесён в КТРМ').length,
    work: all.filter(c => c.operStatus === 'В работе').length,
    paid: all.filter(c => c.payStatus === 'Оплачено').length,
    wait: all.filter(c => c.payStatus !== 'Оплачено').length,
    tte: all.filter(isTTE).length,
  };

  const openNew = () => { setForm(EMPTY); setCloneFrom(''); setErr(''); setModal(true); };
  const fillForm = (c: Cert): typeof EMPTY => ({ id: c.id, fio: c.fio || '', address: c.address || '', phone: c.phone || '', client: c.client || '', meterType: c.meterType || '', serialNo: c.serialNo || '', yearMade: c.yearMade ? String(c.yearMade) : '', waterType: c.waterType || 'х/в', checkDate: iso(c.checkDate), nextCheckDate: iso(c.nextCheckDate), stampNo: c.stampNo || '', sealType: c.sealType === 'ПЛ' ? 'ПЛ' : 'СЛ', readings: c.readings != null ? String(c.readings) : '', result: c.result || 'Годен', operStatus: c.operStatus || 'В работе', payStatus: c.payStatus || 'В ожидании', invoiceType: c.invoiceType || 'Каспи', sentStatus: c.sentStatus || 'Не отправлено', note: c.note || '' });
  const openEdit = (c: Cert) => { setForm(fillForm(c)); setCloneFrom(''); setErr(''); setModal(true); };
  const openClone = (c: Cert) => { setForm({ ...fillForm(c), id: '', checkDate: '', nextCheckDate: '' }); setCloneFrom(`${c.fio || ''}`); setErr(''); setModal(true); };

  function onCheckDate(v: string) {
    setForm(f => {
      const next = v ? `${Number(v.slice(0, 4)) + 5}${v.slice(4)}` : f.nextCheckDate;
      return { ...f, checkDate: v, nextCheckDate: isCert ? next : f.nextCheckDate };
    });
  }

  function buildBody() {
    const base: Record<string, unknown> = { source, docType, fio: form.fio.trim(), address: form.address || '', phone: form.phone || null, client: form.client || null, meterType: form.meterType || null, serialNo: form.serialNo || null, yearMade: form.yearMade ? Number(form.yearMade) : null, waterType: form.waterType, checkDate: form.checkDate || null, result: form.result, operStatus: form.operStatus, payStatus: form.payStatus, invoiceType: form.invoiceType, note: form.note || null };
    if (isCert) return { ...base, nextCheckDate: form.nextCheckDate || null, stampNo: form.stampNo || null, sealType: form.sealType, readings: form.readings || null };
    return { ...base, sentStatus: form.sentStatus };
  }
  async function save() {
    if (!form.fio.trim()) { setErr('Укажите ФИО / объект'); return; }
    setSaving(true); setErr('');
    try {
      if (form.id) await apiSend(`/api/v2/certs/${form.id}`, 'PATCH', buildBody());
      else await apiSend('/api/v2/certs', 'POST', buildBody());
      // «Недавние» пишем только при УСПЕШНОМ сохранении (не при наборе).
      if (form.meterType.trim()) setRecentMeters(pushRecent('meterType', uid, { v: form.meterType.trim() }));
      setModal(false); await mutate(); toast(form.id ? '✅ Сохранено' : (isCert ? '✅ Сертификат добавлен' : '✅ Извещение добавлено'));
    } catch (e) { setErr((e as Error).message); } finally { setSaving(false); }
  }
  async function remove(c: Cert) {
    if (!confirm(`Удалить запись «${c.fio}»?`)) return;
    try { await apiSend(`/api/v2/certs/${c.id}`, 'DELETE'); await mutate(); toast('🗑️ Удалено'); }
    catch (e) { toast('⚠️ ' + (e as Error).message); }
  }
  // Инлайн-смена статуса (Операция/Оплата/Счёт/Отправлено) — PATCH одного поля.
  async function patchField(c: Cert, field: string, value: string) {
    try { await apiSend(`/api/v2/certs/${c.id}`, 'PATCH', { [field]: value }); await mutate(); }
    catch (e) { toast('⚠️ ' + (e as Error).message); }
  }
  // 🤖 → КТРМ: отметить «Внесён в КТРМ».
  async function ktrm(c: Cert) {
    if (c.operStatus === 'Внесён в КТРМ') { toast('Уже внесено в КТРМ'); return; }
    await patchField(c, 'operStatus', 'Внесён в КТРМ'); toast('✅ Внесено в е-КТРМ');
  }

  // ── Экспорт CSV / Word ──
  const exportRows = (arr: Cert[]) => arr.map((c, i) => [String(i + 1), c.fio || '', c.address || '', c.meterType || '', c.serialNo || '', dmy(c.checkDate), isCert ? dmy(c.nextCheckDate) : '', c.stampNo || '', c.readings != null ? String(c.readings) : '', c.waterType || '', c.yearMade ? String(c.yearMade) : '', c.result || '', c.payStatus || '', c.invoiceType || '', c.createdByName || '']);
  const EXP_HEAD = ['№', 'ФИО/объект', 'Адрес', 'Тип', 'Зав.№', 'Поверка', 'Очередная', 'Клеймо', 'Показания', 'Вода', 'Год', 'Результат', 'Оплата', 'Счёт', 'Автор'];
  function exportCsv(arr: Cert[], name: string) {
    const rows = [EXP_HEAD, ...exportRows(arr)];
    const csv = '﻿' + rows.map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(';')).join('\n');
    const b = new Blob([csv], { type: 'text/csv;charset=utf-8' }); const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(b), download: name });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  async function exportWord(arr: Cert[], title: string, name: string) {
    const spec = { titleLines: [title], subtitle: `Направление: ${source} · записей: ${arr.length}`, orientation: 'landscape', columns: EXP_HEAD.map((h, i) => ({ header: h, width: i === 1 || i === 2 ? 22 : 10, align: i >= 8 && i < 14 ? 'right' : 'left' })), rows: exportRows(arr), filename: name };
    try {
      const r = await fetch('/api/v2/docx', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(spec) });
      if (!r.ok) throw new Error('Ошибка выгрузки');
      const b = await r.blob(); const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(b), download: name });
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (e) { toast('⚠️ ' + (e as Error).message); }
  }

  const Mic = ({ k, h }: { k: keyof typeof EMPTY; h: string }) => <button type="button" className="cert-mic" title={`🎤 ${h}`} onClick={() => voiceField(k, h)}>🎤</button>;
  // Инлайн-селект статуса, стилизован как бейдж.
  const SSel = ({ c, field, opts, tone }: { c: Cert; field: keyof Cert; opts: string[]; tone: 'ok' | 'warn' | 'info' | 'neutral' }) => (
    <select className={`cert-inline-sel tone-${tone}`} value={(c[field] as string) || opts[0]} onChange={e => patchField(c, field, e.target.value)} title="Изменить">
      {opts.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );

  return (
    <div>
      <PageTitle title={`Поверка — ${isCert ? 'сертификаты' : 'извещения'}`} sub={`Направление: ${source} · записей: ${list.length}`} action={
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="outline" onClick={() => exportCsv(list, `${isCert ? 'Сертификаты' : 'Извещения'}_${source}.csv`)}>📤 Экспорт</Button>
          <Button variant="outline" onClick={() => exportWord(list, `${isCert ? 'Сертификаты' : 'Извещения'} — ${source}`, `${isCert ? 'Сертификаты' : 'Извещения'}_${source}.docx`)}>⬇ Word</Button>
          <Button onClick={openNew}>+ {isCert ? 'Сертификат' : 'Извещение'}</Button>
        </div>} />

      {/* Строка статистики */}
      <div className="erp-kpi-grid">
        <div className="erp-kpi"><div className="erp-kpi-top"><span className="erp-kpi-ico">📄</span><span className="erp-kpi-label">Всего записей</span></div><div className="erp-kpi-val">{stats.total}</div></div>
        <div className="erp-kpi"><div className="erp-kpi-top"><span className="erp-kpi-ico">✅</span><span className="erp-kpi-label">Внесено в КТРМ</span></div><div className="erp-kpi-val" style={{ color: '#16a34a' }}>{stats.ktrm}</div></div>
        <div className="erp-kpi"><div className="erp-kpi-top"><span className="erp-kpi-ico">🔄</span><span className="erp-kpi-label">В работе</span></div><div className="erp-kpi-val" style={{ color: '#1d4ed8' }}>{stats.work}</div></div>
        <div className="erp-kpi"><div className="erp-kpi-top"><span className="erp-kpi-ico">💳</span><span className="erp-kpi-label">Оплачено</span></div><div className="erp-kpi-val" style={{ color: '#16a34a' }}>{stats.paid}</div></div>
        <div className="erp-kpi"><div className="erp-kpi-top"><span className="erp-kpi-ico">⏳</span><span className="erp-kpi-label">Ожидает</span></div><div className="erp-kpi-val" style={{ color: '#b45309' }}>{stats.wait}</div></div>
        <div className="erp-kpi"><div className="erp-kpi-top"><span className="erp-kpi-ico">🔴</span><span className="erp-kpi-label">ТТЭ (г/в)</span></div><div className="erp-kpi-val" style={{ color: '#dc2626' }}>{stats.tte}</div></div>
      </div>

      <div className="cert-sec-lbl" style={{ marginTop: 14 }}>✏️ Блок 1 · Редактирование</div>
      <Card className="erp-filters" style={{ flexWrap: 'wrap', gap: 8 }}>
        <Badge tone="info">{source}</Badge>
        <Badge tone={isCert ? 'ok' : 'warn'}>{isCert ? '📄 Сертификаты' : '📃 Извещения'}</Badge>
        <Input placeholder="🔍 ФИО, адрес, № счётчика" value={q} onChange={e => setQ(e.target.value)} />
        <Select value={fOper} onChange={e => setFOper(e.target.value)}><option value="">Операция: все</option>{OPER.map(o => <option key={o}>{o}</option>)}</Select>
        <Select value={fPay} onChange={e => setFPay(e.target.value)}><option value="">Оплата: все</option>{PAY.map(o => <option key={o}>{o}</option>)}</Select>
        <Select value={fInv} onChange={e => setFInv(e.target.value)}><option value="">Счёт: все</option>{INV.map(o => <option key={o}>{o}</option>)}</Select>
        {!isCert && <Select value={fSent} onChange={e => setFSent(e.target.value)}><option value="">Отправка: все</option>{SENT.map(o => <option key={o}>{o}</option>)}</Select>}
      </Card>

      <Card style={{ marginTop: 8, padding: 0, overflowX: 'auto' }}>
        {error ? <EmptyRow>Нет доступа к этому направлению.</EmptyRow> : isLoading ? <EmptyRow>Загрузка…</EmptyRow>
          : list.length === 0 ? <EmptyRow>Записей нет. Нажмите «+ {isCert ? 'Сертификат' : 'Извещение'}».</EmptyRow>
          : isCert ? (
            <table className="erp-table cert-reg">
              <thead><tr>
                <th>№</th><th>ФИО абонента</th><th>Адрес абонента</th><th>Тип прибора</th><th>Заводской номер</th>
                <th>Дата поверки</th><th>Очередная поверка</th><th>Номер клейма</th><th style={{ textAlign: 'right' }}>Показания м³</th>
                <th>Вода</th><th>Год</th><th>Прим.</th><th>Телефон</th><th>Клиент</th>
                <th>🔄 Операция</th><th>💳 Оплата</th><th>🧾 Счёт</th><th>Автор</th><th style={{ textAlign: 'center' }}>Действия</th>
              </tr></thead>
              <tbody>
                {list.map((c, i) => (
                  <tr key={c.id} className={isTTE(c) ? 'cert-hot' : ''}>
                    <td className="erp-muted" style={{ fontSize: 11 }}>{i + 1}</td>
                    <td className="erp-td-main">{c.fio}</td>
                    <td style={{ fontSize: 11, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.address || '—'}</td>
                    <td><code className="cert-type">{c.meterType || '—'}</code></td>
                    <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{c.serialNo || '—'}</td>
                    <td style={{ fontSize: 11 }}>{dmy(c.checkDate)}</td>
                    <td style={{ fontSize: 11 }}><Badge tone="ok">{dmy(c.nextCheckDate)}</Badge></td>
                    <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{c.stampNo || '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, fontSize: 11 }}>{c.readings != null ? num(c.readings).toLocaleString('ru-RU') : '—'}</td>
                    <td style={{ fontSize: 11 }}>{c.waterType === 'г/в' ? '🔴 г/в' : '🔵 х/в'}</td>
                    <td className="erp-muted" style={{ fontSize: 11 }}>{c.yearMade || '—'}</td>
                    <td style={{ fontSize: 11, color: '#c2410c', fontWeight: 700 }}>{c.note || ''}</td>
                    <td className="erp-muted" style={{ fontSize: 11 }}>{c.phone || '—'}</td>
                    <td style={{ fontSize: 11 }}>{c.client || '—'}</td>
                    <td><SSel c={c} field="operStatus" opts={OPER} tone={operTone(c.operStatus)} /></td>
                    <td><SSel c={c} field="payStatus" opts={PAY} tone={c.payStatus === 'Оплачено' ? 'ok' : 'warn'} /></td>
                    <td><SSel c={c} field="invoiceType" opts={INV} tone="neutral" /></td>
                    <td className="erp-muted" style={{ fontSize: 11 }}>{c.createdByName || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>
                      <button className="erp-icon-btn" title="Изменить" onClick={() => openEdit(c)}>✏️</button>
                      <button className="erp-icon-btn" title="Клонировать" onClick={() => openClone(c)}>⧉</button>
                      <button className="erp-icon-btn" title={c.operStatus === 'Внесён в КТРМ' ? 'Уже в КТРМ' : 'Внести в е-КТРМ'} style={{ color: c.operStatus === 'Внесён в КТРМ' ? '#16a34a' : '#1d4ed8' }} onClick={() => ktrm(c)}>{c.operStatus === 'Внесён в КТРМ' ? '✅' : '🤖'}</button>
                      <button className="erp-icon-btn" title="Удалить" style={{ color: '#dc2626' }} onClick={() => remove(c)}>🗑️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="erp-table">
              <thead><tr>
                <th>№</th><th>ФИО / Объект</th><th>Адрес</th><th>№ счётчика</th><th>Дата поверки</th><th>Плановая след.</th>
                <th>🔄 Операция</th><th>💳 Оплата</th><th>🧾 Счёт</th><th>📨 Отправлено</th><th>Автор</th><th style={{ textAlign: 'center' }}>Действия</th>
              </tr></thead>
              <tbody>
                {list.map((c, i) => (
                  <tr key={c.id} className={isTTE(c) ? 'cert-hot' : ''}>
                    <td className="erp-muted" style={{ fontSize: 11 }}>{i + 1}</td>
                    <td className="erp-td-main">{c.fio}</td>
                    <td style={{ fontSize: 11 }}>{c.address || '—'}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{c.serialNo || '—'}</td>
                    <td style={{ fontSize: 11 }}>{dmy(c.checkDate)}</td>
                    <td style={{ fontSize: 11 }}>{dmy(c.nextCheckDate)}</td>
                    <td><SSel c={c} field="operStatus" opts={OPER} tone={operTone(c.operStatus)} /></td>
                    <td><SSel c={c} field="payStatus" opts={PAY} tone={c.payStatus === 'Оплачено' ? 'ok' : 'warn'} /></td>
                    <td><SSel c={c} field="invoiceType" opts={INV} tone="neutral" /></td>
                    <td><SSel c={c} field="sentStatus" opts={SENT} tone={sentTone(c.sentStatus)} /></td>
                    <td className="erp-muted" style={{ fontSize: 11 }}>{c.createdByName || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>
                      <button className="erp-icon-btn" title="Изменить" onClick={() => openEdit(c)}>✏️</button>
                      <button className="erp-icon-btn" title="Клонировать" onClick={() => openClone(c)}>⧉</button>
                      <button className="erp-icon-btn" title="Удалить" style={{ color: '#dc2626' }} onClick={() => remove(c)}>🗑️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </Card>

      {isCert && <>
        {/* Блок 2 · Ожидание оплаты */}
        <div className="cert-sec-lbl" style={{ marginTop: 22 }}>⏳ Блок 2 · Ожидание оплаты <span className="erp-muted">· {waiting.length}</span></div>
        <Card><CertAccordion items={waiting} empty="Нет записей в ожидании оплаты." /></Card>

        {/* Блок 3 · Извещение о непригодности */}
        <div className="cert-sec-lbl" style={{ marginTop: 22, display: 'flex', alignItems: 'center' }}>📄 Блок 3 · Извещение о непригодности <span className="erp-muted">· {unfit.length}</span>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <Button variant="outline" onClick={() => exportCsv(unfit, `Непригодность_${source}.csv`)}>📤 Экспорт извещения</Button>
            <Button variant="outline" onClick={() => exportWord(unfit, `Извещение о непригодности — ${source}`, `Непригодность_${source}.docx`)}>⬇ Word</Button>
          </span>
        </div>
        <Card><CertAccordion items={unfit} empty="Непригодных счётчиков нет." /></Card>

        {/* Блок 4 · История */}
        <div className="cert-sec-lbl" style={{ marginTop: 22, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>🗂️ Блок 4 · История <span className="erp-muted">· {histList.length}</span>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <label className="erp-muted" style={{ fontSize: 11 }}>с <input type="date" value={histFrom} onChange={e => setHistFrom(e.target.value)} style={{ fontSize: 11 }} /></label>
            <label className="erp-muted" style={{ fontSize: 11 }}>по <input type="date" value={histTo} onChange={e => setHistTo(e.target.value)} style={{ fontSize: 11 }} /></label>
            <Select value={histDays} onChange={e => setHistDays(e.target.value)}><option value="7">Последние 7 дней</option><option value="14">Последние 14 дней</option><option value="30">Последние 30 дней</option><option value="0">Все</option></Select>
          </span>
        </div>
        <Card><CertAccordion items={histList} empty="Нет записей за выбранный период." /></Card>
      </>}

      <Modal open={modal} onClose={() => setModal(false)} width={680}
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>{form.id ? (isCert ? '✏️ Сертификат' : '✏️ Извещение') : `➕ ${isCert ? 'Сертификат' : 'Извещение'} · ${source}`}{cloneFrom && <span className="sale-clone-badge">⧉ на основе {cloneFrom}</span>}</span>}
        footer={<><Button onClick={save} disabled={saving}>{saving ? 'Сохранение…' : '💾 Сохранить'}</Button><Button variant="outline" onClick={() => setModal(false)}>Отмена</Button></>}>
        {err && <div className="erp-form-err">{err}</div>}
        <div className="cert-sec-lbl">📋 Данные {isCert ? 'поверки' : 'извещения'}
          {voiceSupported && <button type="button" className="cert-voice-all" onClick={voiceAll}>🎤 Заполнить голосом</button>}
        </div>
        <div className="erp-form-row">
          <Field label="ФИО абонента" required><div className="cert-vf"><Input value={form.fio} onChange={e => setForm({ ...form, fio: e.target.value })} placeholder="ФИО" /><Mic k="fio" h="ФИО абонента" /></div></Field>
          <Field label="Адрес"><div className="cert-vf"><Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Адрес" /><Mic k="address" h="Адрес" /></div></Field>
        </div>
        <div className="erp-form-row">
          <Field label="Тип прибора">
            <div style={{ position: 'relative' }}>
              <Input value={form.meterType} onChange={e => { setForm({ ...form, meterType: e.target.value }); setMeterOpen(true); }} onFocus={() => setMeterOpen(true)} onBlur={() => setTimeout(() => setMeterOpen(false), 150)} onKeyDown={meterKey} placeholder="Начните вводить — справочник и склад" />
              {meterOpen && meterFlat.length > 0 && (
                <div className="cert-meter-dd">
                  {showRecentMeters && <div className="cert-meter-grp">🕘 Недавние</div>}
                  {showRecentMeters && recentMeters.map((r, i) => (
                    <div key={`r-${r.v}`} className={`cert-meter-opt${meterIdx === i ? ' is-active' : ''}`} onMouseEnter={() => setMeterIdx(i)} onMouseDown={() => pickMeter(r.v)}>
                      <span>{r.v}</span>
                      <span role="button" title="Убрать из недавних" onMouseDown={e => { e.preventDefault(); e.stopPropagation(); dropRecentMeter(r.v); }} style={{ color: '#94a3b8', cursor: 'pointer', padding: '0 4px', fontSize: 12 }}>✕</span>
                    </div>
                  ))}
                  {(deviceHits || []).length > 0 && <div className="cert-meter-grp">Справочник типов</div>}
                  {(deviceHits || []).map((d, i) => (
                    <div key={`d-${d.id}`} className={`cert-meter-opt${meterIdx === i ? ' is-active' : ''}`} onMouseEnter={() => setMeterIdx(i)} onMouseDown={() => pickMeter(d.name)}>
                      <span>{d.name}</span>{d.usageCount > 0 && <span className="cert-meter-uses">{d.usageCount}</span>}
                    </div>
                  ))}
                  {skuHits.length > 0 && <div className="cert-meter-grp">Со склада</div>}
                  {skuHits.map((s, jj) => { const idx = (deviceHits || []).length + jj; return <div key={`s-${s.label}`} className={`cert-meter-opt${meterIdx === idx ? ' is-active' : ''}`} onMouseEnter={() => setMeterIdx(idx)} onMouseDown={() => pickMeter(s.value)}>{s.label}</div>; })}
                </div>
              )}
            </div>
          </Field>
          <Field label="Заводской номер"><div className="cert-vf"><Input value={form.serialNo} onChange={e => setForm({ ...form, serialNo: e.target.value })} placeholder="Серийный номер" style={{ fontFamily: 'monospace' }} /><Mic k="serialNo" h="Номер счётчика" /></div></Field>
        </div>
        <div className="erp-form-row">
          <Field label="Дата поверки"><Input type="date" value={form.checkDate} onChange={e => onCheckDate(e.target.value)} /></Field>
          {isCert
            ? <Field label="Дата очередной поверки"><Input type="date" value={form.nextCheckDate} onChange={e => setForm({ ...form, nextCheckDate: e.target.value })} /></Field>
            : <Field label="Гор/хол вода"><Select value={form.waterType} onChange={e => setForm({ ...form, waterType: e.target.value })}><option>х/в</option><option>г/в</option></Select></Field>}
        </div>
        {isCert && (<>
          <div className="erp-form-row">
            <Field label="№ клейма"><div className="cert-vf"><Input value={form.stampNo} onChange={e => setForm({ ...form, stampNo: e.target.value })} placeholder="0000000" style={{ fontFamily: 'monospace' }} /><Mic k="stampNo" h="Номер клейма" /></div></Field>
            <Field label="Тип поверительного клейма">
              <div className="cert-seal">
                <label><input type="radio" name="sealType" checked={form.sealType === 'СЛ'} onChange={() => setForm({ ...form, sealType: 'СЛ' })} /> Самоклеющийся лейбл (СЛ)</label>
                <label><input type="radio" name="sealType" checked={form.sealType === 'ПЛ'} onChange={() => setForm({ ...form, sealType: 'ПЛ' })} /> Пластиковое пломбо (ПЛ)</label>
              </div>
            </Field>
          </div>
          <div className="erp-form-row">
            <Field label="Показания м³"><div className="cert-vf"><Input type="number" value={form.readings} onChange={e => setForm({ ...form, readings: e.target.value })} /><Mic k="readings" h="Показания в кубометрах" /></div></Field>
            <Field label="Тип воды"><Select value={form.waterType} onChange={e => setForm({ ...form, waterType: e.target.value })}><option>х/в</option><option>г/в</option></Select></Field>
          </div>
        </>)}
        <div className="erp-form-row">
          <Field label="Результат поверки"><Select value={form.result} onChange={e => setForm({ ...form, result: e.target.value })}><option value="Годен">✅ Годен</option><option value="Не годен">⛔ Не годен</option></Select></Field>
          <Field label="Год выпуска"><div className="cert-vf"><Input type="number" value={form.yearMade} onChange={e => setForm({ ...form, yearMade: e.target.value })} placeholder="2020" /><Mic k="yearMade" h="Год выпуска" /></div></Field>
        </div>
        <div className="erp-form-row">
          <Field label="Телефон (не печатается)"><div className="cert-vf"><Input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+7 700 000 00 00" /><Mic k="phone" h="Телефон" /></div></Field>
          <Field label="Клиент">
            <Select value="" onChange={e => { const c = (clients || []).find(x => x.id === e.target.value); if (c) setForm(f => ({ ...f, client: c.name })); }}><option value="">— из справочника —</option>{(clients || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
            <div className="cert-vf" style={{ marginTop: 6 }}><Input value={form.client} onChange={e => setForm({ ...form, client: e.target.value })} placeholder="Название клиента / ТОО" /><Mic k="client" h="Клиент" /></div>
          </Field>
        </div>
        <Field label="Примечание"><div className="cert-vf"><Input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="ТТЭ и др." /><Mic k="note" h="Примечание" /></div></Field>

        <div className="cert-sec-lbl">🔄 Статусы</div>
        <div className="erp-form-row" style={{ gridTemplateColumns: isCert ? '1fr 1fr 1fr' : '1fr 1fr 1fr 1fr' }}>
          <Field label="Операция"><Select value={form.operStatus} onChange={e => setForm({ ...form, operStatus: e.target.value })}>{OPER.map(o => <option key={o}>{o}</option>)}</Select></Field>
          <Field label="Оплата"><Select value={form.payStatus} onChange={e => setForm({ ...form, payStatus: e.target.value })}>{PAY.map(o => <option key={o}>{o}</option>)}</Select></Field>
          <Field label="Счёт"><Select value={form.invoiceType} onChange={e => setForm({ ...form, invoiceType: e.target.value })}>{INV.map(o => <option key={o}>{o}</option>)}</Select></Field>
          {!isCert && <Field label="Отправка"><Select value={form.sentStatus} onChange={e => setForm({ ...form, sentStatus: e.target.value })}>{SENT.map(o => <option key={o}>{o}</option>)}</Select></Field>}
        </div>

        {form.id && <EntityHistory entityType="certificate" entityId={form.id} />}
      </Modal>

      {voice.open && (
        <div className="cert-voice-ov" onClick={voiceStop}>
          <div className="cert-voice-sheet" onClick={e => e.stopPropagation()}>
            <div className={`cert-voice-ind${voice.listening ? ' on' : ''}`}>🎤</div>
            <div className="cert-voice-hint">{voice.hint}</div>
            <div className="cert-voice-label">{voice.listening ? 'Слушаю… говорите!' : 'Готово'}</div>
            <div className="cert-voice-tr">{voice.transcript || '…'}</div>
            <Button variant="outline" onClick={voiceStop}>Стоп</Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CertsPage() {
  return <React.Suspense fallback={<div className="erp-muted" style={{ padding: 20 }}>Загрузка…</div>}><CertsInner /></React.Suspense>;
}
