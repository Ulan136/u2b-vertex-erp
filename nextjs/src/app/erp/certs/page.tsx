'use client';
import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { useApi, apiSend } from '@/lib/api';
import { toast } from '@/lib/toast';
import { Card, Badge, Button, PageTitle, Modal, Field, Input, Select, EmptyRow } from '@/components/ui';
import EntityHistory from '@/components/erp/EntityHistory';

type Cert = {
  id: string; source: string; docType?: string | null; fio?: string | null; address?: string | null; phone?: string | null; client?: string | null;
  meterType?: string | null; serialNo?: string | null; yearMade?: number | null; waterType?: string | null;
  checkDate?: string | null; nextCheckDate?: string | null; stampNo?: string | null; sealType?: string | null; readings?: string | number | null;
  result?: string | null; operStatus?: string | null; payStatus?: string | null; invoiceType?: string | null; note?: string | null; createdByName?: string | null;
};
type Product = { id: string; skuCode: string; name: string };
type Client = { id: string; name: string };
type DeviceTypeHit = { id: string; name: string; usageCount: number };

const SOURCES = ['САМИ', 'ВДК', 'ТЭЦ', 'Выездная', 'Первичная-КМ', 'Первичная-АК', 'Астана'];
const OPER = ['В работе', 'Готова к КТРМ', 'Внести в КТРМ', 'КТРМ 70%', 'Внесён в КТРМ'];
const PAY = ['В ожидании', 'Оплачено'];
const INV = ['Каспи', 'БЦК', 'Наличка', 'Каспи Голд'];
const dmy =(d?: string | null) => (d ? String(d).slice(0, 10).split('-').reverse().join('.') : '—');
const iso = (d?: string | null) => (d ? String(d).slice(0, 10) : '');
const operTone = (s?: string | null): 'ok' | 'warn' | 'info' | 'neutral' => s === 'Внесён в КТРМ' ? 'ok' : s === 'В работе' ? 'neutral' : 'warn';
const EMPTY = { id: '', fio: '', address: '', phone: '', client: '', meterType: '', serialNo: '', yearMade: '', waterType: 'х/в', checkDate: '', nextCheckDate: '', stampNo: '', sealType: 'СЛ', readings: '', result: 'Годен', operStatus: 'В работе', payStatus: 'В ожидании', invoiceType: 'Каспи', note: '' };

// Поля для «Заполнить голосом» (по порядку)
const VOICE_CERT: Array<[keyof typeof EMPTY, string]> = [['fio', 'ФИО абонента'], ['address', 'Адрес'], ['serialNo', 'Номер счётчика'], ['stampNo', 'Номер клейма'], ['readings', 'Показания в кубометрах'], ['yearMade', 'Год выпуска'], ['phone', 'Телефон'], ['client', 'Клиент'], ['note', 'Примечание']];
const VOICE_IZV: Array<[keyof typeof EMPTY, string]> = [['fio', 'ФИО абонента'], ['address', 'Адрес'], ['serialNo', 'Заводской номер'], ['yearMade', 'Год выпуска'], ['phone', 'Телефон'], ['client', 'Клиент'], ['note', 'Примечание']];

function CertsInner() {
  const sp = useSearchParams();
  const initial = sp.get('source');
  const [source, setSource] = React.useState(initial && SOURCES.includes(initial) ? initial : 'САМИ');
  const [docType, setDocType] = React.useState<'cert' | 'izv'>(sp.get('type') === 'izv' ? 'izv' : 'cert');
  const [q, setQ] = React.useState('');
  // Источник и тип ведёт меню (отдельные пункты Сертификат/Извещение под источником).
  React.useEffect(() => {
    const s = sp.get('source'); if (s && SOURCES.includes(s)) setSource(s);
    const t = sp.get('type'); if (t === 'cert' || t === 'izv') setDocType(t);
  }, [sp]);
  const { data: certs, error, isLoading, mutate } = useApi<Cert[]>(`/api/v2/certs?source=${encodeURIComponent(source)}&archived=false&type=${docType}`);
  const { data: products } = useApi<Product[]>('/api/v2/products');
  const { data: clients } = useApi<Client[]>('/api/v2/clients');
  const [modal, setModal] = React.useState(false);
  const [form, setForm] = React.useState<typeof EMPTY>(EMPTY);
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState('');

  // Тип прибора — автоподсказка: справочник типов (самообучающийся) + склад.
  const [meterOpen, setMeterOpen] = React.useState(false);
  const [meterIdx, setMeterIdx] = React.useState(-1);
  const meterQuery = form.meterType.trim();
  const { data: deviceHits } = useApi<DeviceTypeHit[]>(meterQuery ? `/api/v2/device-types?q=${encodeURIComponent(meterQuery)}` : null);
  const skuHits = React.useMemo(() => {
    const qq = meterQuery.toLowerCase();
    if (!qq) return [] as { label: string; value: string }[];
    const seen = new Set<string>();
    return (products || [])
      .filter(p => `${p.skuCode} ${p.name}`.toLowerCase().includes(qq) && !seen.has(p.name) && seen.add(p.name))
      .map(p => ({ label: `${p.skuCode} · ${p.name}`, value: p.name })).slice(0, 6);
  }, [products, meterQuery]);
  // Плоский список для навигации клавишами: [справочник…, затем склад…].
  const meterFlat = React.useMemo(() => [
    ...(deviceHits || []).map(d => d.name),
    ...skuHits.map(s => s.value),
  ], [deviceHits, skuHits]);
  React.useEffect(() => { setMeterIdx(-1); }, [meterQuery]);
  const pickMeter = (value: string) => { setForm(f => ({ ...f, meterType: value })); setMeterOpen(false); setMeterIdx(-1); };
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

  const list = (certs || []).filter(c => !q.trim() || `${c.fio} ${c.address} ${c.serialNo}`.toLowerCase().includes(q.toLowerCase()));
  const openNew = () => { setForm(EMPTY); setErr(''); setModal(true); };
  const openEdit = (c: Cert) => {
    setForm({ id: c.id, fio: c.fio || '', address: c.address || '', phone: c.phone || '', client: c.client || '', meterType: c.meterType || '', serialNo: c.serialNo || '', yearMade: c.yearMade ? String(c.yearMade) : '', waterType: c.waterType || 'х/в', checkDate: iso(c.checkDate), nextCheckDate: iso(c.nextCheckDate), stampNo: c.stampNo || '', sealType: c.sealType === 'ПЛ' ? 'ПЛ' : 'СЛ', readings: c.readings != null ? String(c.readings) : '', result: c.result || 'Годен', operStatus: c.operStatus || 'В работе', payStatus: c.payStatus || 'В ожидании', invoiceType: c.invoiceType || 'Каспи', note: c.note || '' });
    setErr(''); setModal(true);
  };
  function onCheckDate(v: string) {
    setForm(f => {
      const next = v ? `${Number(v.slice(0, 4)) + 5}${v.slice(4)}` : f.nextCheckDate;
      return { ...f, checkDate: v, nextCheckDate: docType === 'cert' ? next : f.nextCheckDate };
    });
  }

  async function save() {
    if (!form.fio.trim()) { setErr('Укажите ФИО / объект'); return; }
    setSaving(true); setErr('');
    const base = { source, docType, fio: form.fio.trim(), address: form.address || '', phone: form.phone || null, client: form.client || null, meterType: form.meterType || null, serialNo: form.serialNo || null, yearMade: form.yearMade ? Number(form.yearMade) : null, waterType: form.waterType, checkDate: form.checkDate || null, result: form.result, operStatus: form.operStatus, payStatus: form.payStatus, invoiceType: form.invoiceType, note: form.note || null };
    const body = docType === 'cert'
      ? { ...base, nextCheckDate: form.nextCheckDate || null, stampNo: form.stampNo || null, sealType: form.sealType, readings: form.readings || null }
      : base;
    try {
      if (form.id) await apiSend(`/api/v2/certs/${form.id}`, 'PATCH', body);
      else await apiSend('/api/v2/certs', 'POST', body);
      setModal(false); await mutate(); toast(form.id ? '✅ Сохранено' : (docType === 'izv' ? '✅ Извещение добавлено' : '✅ Сертификат добавлен'));
    } catch (e) { setErr((e as Error).message); } finally { setSaving(false); }
  }
  async function remove(c: Cert) {
    if (!confirm(`Удалить запись «${c.fio}»?`)) return;
    try { await apiSend(`/api/v2/certs/${c.id}`, 'DELETE'); await mutate(); toast('🗑️ Удалено'); }
    catch (e) { toast('⚠️ ' + (e as Error).message); }
  }

  const isCert = docType === 'cert';
  const Mic = ({ k, h }: { k: keyof typeof EMPTY; h: string }) => <button type="button" className={`cert-mic${voice.listening ? '' : ''}`} title={`🎤 ${h}`} onClick={() => voiceField(k, h)}>🎤</button>;

  return (
    <div>
      <PageTitle title={`Поверка — ${isCert ? 'сертификаты' : 'извещения'}`} sub={`Направление: ${source} · записей: ${list.length}`} action={<Button onClick={openNew}>+ {isCert ? 'Сертификат' : 'Извещение'}</Button>} />

      <Card className="erp-filters">
        <Badge tone="info">{source}</Badge>
        <Badge tone={isCert ? 'ok' : 'warn'}>{isCert ? '📄 Сертификаты' : '📃 Извещения'}</Badge>
        <Input placeholder="🔍 ФИО, адрес, № счётчика" value={q} onChange={e => setQ(e.target.value)} />
      </Card>

      <Card style={{ marginTop: 12, padding: 0, overflowX: 'auto' }}>
        {error ? <EmptyRow>Нет доступа к этому направлению.</EmptyRow> : isLoading ? <EmptyRow>Загрузка…</EmptyRow>
          : list.length === 0 ? <EmptyRow>Записей нет. Нажмите «+ {isCert ? 'Сертификат' : 'Извещение'}».</EmptyRow>
          : (
            <table className="erp-table">
              <thead><tr><th>ФИО / объект</th><th>Адрес</th><th>Тип · № счётчика</th><th>Поверка</th>{isCert && <th>След.</th>}{isCert && <th>Клеймо</th>}<th>Результат</th><th>Оплата</th><th>Статус</th><th>Автор</th><th style={{ textAlign: 'right' }}></th></tr></thead>
              <tbody>
                {list.map(c => (
                  <tr key={c.id}>
                    <td className="erp-td-main">{c.fio}</td>
                    <td style={{ fontSize: 12 }}>{c.address || '—'}</td>
                    <td style={{ fontSize: 12 }}>{c.meterType || '—'} <span className="erp-muted" style={{ fontFamily: 'monospace' }}>{c.serialNo || ''}</span></td>
                    <td style={{ fontSize: 12 }}>{dmy(c.checkDate)}</td>
                    {isCert && <td style={{ fontSize: 12 }}>{dmy(c.nextCheckDate)}</td>}
                    {isCert && <td style={{ fontSize: 12, fontFamily: 'monospace' }}>{c.stampNo || '—'}</td>}
                    <td><Badge tone={c.result === 'Не годен' ? 'err' : 'ok'}>{c.result || 'Годен'}</Badge></td>
                    <td><Badge tone={c.payStatus === 'Оплачено' ? 'ok' : 'warn'}>{c.payStatus === 'Оплачено' ? '✓' : '⏳'}</Badge></td>
                    <td><Badge tone={operTone(c.operStatus)}>{c.operStatus}</Badge></td>
                    <td className="erp-muted" style={{ fontSize: 12 }}>{c.createdByName || '—'}</td>
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

      <Modal open={modal} onClose={() => setModal(false)} title={form.id ? (isCert ? '✏️ Сертификат' : '✏️ Извещение') : `➕ ${isCert ? 'Сертификат' : 'Извещение'} · ${source}`} width={680}
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
                  {(deviceHits || []).length > 0 && <div className="cert-meter-grp">Справочник типов</div>}
                  {(deviceHits || []).map((d, i) => (
                    <div key={`d-${d.id}`} className={`cert-meter-opt${meterIdx === i ? ' is-active' : ''}`} onMouseEnter={() => setMeterIdx(i)} onMouseDown={() => pickMeter(d.name)}>
                      <span>{d.name}</span>{d.usageCount > 0 && <span className="cert-meter-uses">{d.usageCount}</span>}
                    </div>
                  ))}
                  {skuHits.length > 0 && <div className="cert-meter-grp">Со склада</div>}
                  {skuHits.map((s, j) => {
                    const idx = (deviceHits || []).length + j;
                    return <div key={`s-${s.label}`} className={`cert-meter-opt${meterIdx === idx ? ' is-active' : ''}`} onMouseEnter={() => setMeterIdx(idx)} onMouseDown={() => pickMeter(s.value)}>{s.label}</div>;
                  })}
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

        {isCert && (
          <>
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
          </>
        )}

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
        <div className="erp-form-row" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          <Field label="Операция"><Select value={form.operStatus} onChange={e => setForm({ ...form, operStatus: e.target.value })}>{OPER.map(o => <option key={o}>{o}</option>)}</Select></Field>
          <Field label="Оплата"><Select value={form.payStatus} onChange={e => setForm({ ...form, payStatus: e.target.value })}>{PAY.map(o => <option key={o}>{o}</option>)}</Select></Field>
          <Field label="Счёт"><Select value={form.invoiceType} onChange={e => setForm({ ...form, invoiceType: e.target.value })}>{INV.map(o => <option key={o}>{o}</option>)}</Select></Field>
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
