'use client';
import * as React from 'react';
import { formatDate } from '@/lib/format';
import { useSearchParams } from 'next/navigation';
import { useApi, apiSend } from '@/lib/api';
import { toast } from '@/lib/toast';
import { Card, Badge, Button, PageTitle, Modal, Field, Input, MoneyInput, Select, EmptyRow, DateRange } from '@/components/ui';
import EntityHistory from '@/components/erp/EntityHistory';
import ClientPicker from '@/components/erp/ClientPicker';
import { getRecent, pushRecent, removeRecent, type RecentItem } from '@/lib/recent';
import { payTone } from '@/lib/status';   // единый тон статуса оплаты (P1-5)
import { useCols, ColumnMenu } from '@/components/erp/ColumnMenu';
import { useRowFocus } from '@/lib/useRowFocus';

// Колонки реестра сертификатов для попапа «Колонки» (№/ФИО/Действия всегда видны).
const CERT_COLS = [
  { key: 'no', label: '№', locked: true }, { key: 'fio', label: 'ФИО абонента', locked: true }, { key: 'address', label: 'Адрес' },
  { key: 'meter', label: 'Тип прибора' }, { key: 'serial', label: 'Заводской номер' }, { key: 'checkdate', label: 'Дата поверки' },
  { key: 'nextdate', label: 'Очередная поверка' }, { key: 'stamp', label: 'Номер клейма' }, { key: 'readings', label: 'Показания м³' },
  { key: 'water', label: 'Вода' }, { key: 'year', label: 'Год' }, { key: 'note', label: 'Прим.' },
  { key: 'phone', label: 'Телефон' }, { key: 'client', label: 'Клиент' }, { key: 'sum', label: 'Сумма' }, { key: 'oper', label: 'Операция' },
  { key: 'pay', label: 'Оплата' }, { key: 'invoice', label: 'Счёт' }, { key: 'author', label: 'Автор' },
  { key: 'actions', label: 'Действия', locked: true },
];

type Cert = {
  id: string; source: string; docType?: string | null; fio?: string | null; address?: string | null; phone?: string | null; client?: string | null;
  meterType?: string | null; serialNo?: string | null; yearMade?: number | null; waterType?: string | null;
  checkDate?: string | null; nextCheckDate?: string | null; stampNo?: string | null; sealType?: string | null; readings?: string | number | null;
  result?: string | null; operStatus?: string | null; payStatus?: string | null; invoiceType?: string | null; sentStatus?: string | null; note?: string | null; createdByName?: string | null; createdAt?: string | null; amount?: string | number | null;
  accuracyClass?: string | null; ownerKind?: string | null; ownerTaxId?: string | null; addressKz?: string | null; verifier?: string | null;
};
type Acct = { id: string; name: string; section?: string | null; category?: string | null; isActive?: boolean; icon?: string | null };
const fmtNum = (n: number) => (Number(n) || 0).toLocaleString('ru-RU');
type Product = { id: string; skuCode: string; name: string };
type Client = { id: string; name: string };
type DeviceTypeHit = { id: string; name: string; usageCount: number };

const SOURCES = ['САМИ', 'ВДК', 'ТЭЦ', 'Выездная', 'Первичная-КМ', 'Первичная-АК', 'Астана'];
const OPER = ['В работе', 'Готова к КТРМ', 'Внести в КТРМ', 'КТРМ 70%', 'Внесён в КТРМ'];
const PAY = ['В ожидании', 'Оплачено', 'Бесплатно'];
const INV = ['Каспи', 'БЦК', 'Наличка'];
const SENT = ['Не отправлено', 'Запланировано', 'Отправлено'];
const dmy = (d?: string | null) => formatDate(d) || '—';
const iso = (d?: string | null) => (d ? String(d).slice(0, 10) : '');
const num = (v: unknown) => Number(v) || 0;
const operTone = (s?: string | null): 'ok' | 'warn' | 'info' | 'neutral' => s === 'Внесён в КТРМ' ? 'ok' : s === 'В работе' ? 'neutral' : 'warn';
const sentTone = (s?: string | null): 'ok' | 'warn' | 'info' => s === 'Отправлено' ? 'ok' : s === 'Запланировано' ? 'info' : 'warn';
const isTTE = (c: Cert) => /ттэ/i.test(c.note || '') || c.waterType === 'г/в';
const EMPTY = { id: '', fio: '', address: '', phone: '', client: '', meterType: '', serialNo: '', yearMade: '', waterType: 'х/в', checkDate: '', nextCheckDate: '', stampNo: '', sealType: 'СЛ', readings: '', result: 'Годен', operStatus: 'В работе', payStatus: 'В ожидании', invoiceType: 'Каспи', sentStatus: 'Не отправлено', note: '', amount: '', accuracyClass: '', ownerKind: 'физлицо', ownerTaxId: '', addressKz: '', verifier: '' };

// Поверители — строго списком. В е-КТРМ один и тот же человек уже попал
// туда в разных написаниях («Болегенов А.» и «Болегенов Арслан»), и свободный
// ввод это повторит. Список правится в «Справочниках».
const VERIFIERS = ['Болегенов А.', 'Оңласынбек А.Ғ.', 'Бейбіт Ғ.Б.', 'Абдикалыков А.А.'];

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
              <Badge tone={payTone(c.payStatus)}>{c.payStatus}</Badge>
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
  const [fFrom, setFFrom] = React.useState('');
  const [fTo, setFTo] = React.useState('');
  const [fInv, setFInv] = React.useState('');
  const [fSent, setFSent] = React.useState('');
  const [fWater, setFWater] = React.useState('');   // фильтр «Вода»: х/в / г/в
  const [histDays, setHistDays] = React.useState('30');
  const [histFrom, setHistFrom] = React.useState('');
  const [histTo, setHistTo] = React.useState('');
  React.useEffect(() => {
    const s = sp.get('source'); if (s && SOURCES.includes(s)) setSource(s);
    const t = sp.get('type'); if (t === 'cert' || t === 'izv') setDocType(t);
  }, [sp]);
  const { data: certs, error, isLoading, mutate } = useApi<Cert[]>(`/api/v2/certs?source=${encodeURIComponent(source)}&archived=false&type=${docType}`);
  const { data: products } = useApi<Product[]>('/api/v2/products');
  const { data: clients, mutate: mutateClients } = useApi<Client[]>('/api/v2/clients');
  const { data: fin } = useApi<{ accounts: Acct[] }>('/api/v2/finance');
  // Оплата прямых сертификатов: счета раздела источника (Астана→branch, иначе poverka).
  const isDirect = source !== 'Выездная';
  const certSection = source === 'Астана' ? 'branch' : 'poverka';
  const secAccounts = React.useMemo(() => (fin?.accounts || []).filter(a => (a.section || '') === certSection && a.isActive !== false), [fin, certSection]);
  const defaultAcc = secAccounts.find(a => a.category === 'kaspi') || secAccounts[0];
  const [payRows, setPayRows] = React.useState<Array<{ accountId: string; amount: string }>>([{ accountId: '', amount: '' }]);
  const [payTouched, setPayTouched] = React.useState(false);   // трогал ли пользователь оплату/цену в этой сессии модалки
  const setPay = (updater: React.SetStateAction<Array<{ accountId: string; amount: string }>>) => { setPayTouched(true); setPayRows(updater); };
  const [modal, setModal] = React.useState(false);
  const [form, setForm] = React.useState<typeof EMPTY>(EMPTY);
  const [cloneFrom, setCloneFrom] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState('');
  // ── Режим «Оплата по клиенту» (Блок 1, не Выездная) ──
  const [fClient, setFClient] = React.useState('');               // фильтр по клиенту
  const [pcOpen, setPcOpen] = React.useState(false);              // модалка оплаты по клиенту
  const [pcPrice, setPcPrice] = React.useState('');              // цена за сертификат
  const [pcRows, setPcRows] = React.useState<Array<{ accountId: string; amount: string }>>([{ accountId: '', amount: '' }]);
  const [pcCommOn, setPcCommOn] = React.useState(true);          // выплачивать комиссию клиенту?
  const [pcCommPer, setPcCommPer] = React.useState('200');       // комиссия за сертификат, ₸
  const [pcCommAcct, setPcCommAcct] = React.useState('');        // счёт выплаты комиссии
  const [pcSaving, setPcSaving] = React.useState(false);
  const [pcErr, setPcErr] = React.useState('');
  // При открытии модалки — одна строка оплаты: счёт раздела по умолчанию + цена.
  React.useEffect(() => { if (modal) { setPayRows([{ accountId: defaultAcc?.id || '', amount: form.amount || '' }]); setPayTouched(false); } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [modal]);
  const payTotal = payRows.reduce((s, p) => s + num(p.amount), 0);
  const priceNum = num(form.amount);
  const payMismatch = isDirect && form.payStatus === 'Оплачено' && priceNum > 0 && Math.abs(payTotal - priceNum) > 0.01;

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
    if (q.trim() && !`${c.fio} ${c.address} ${c.serialNo} ${c.client || ''} ${c.phone || ''}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (fOper && c.operStatus !== fOper) return false;
    if (fPay && c.payStatus !== fPay) return false;
    if (fClient && (c.client || '') !== fClient) return false;
    if (fInv && c.invoiceType !== fInv) return false;
    if (fWater && (c.waterType || '') !== fWater) return false;
    if (!isCert && fSent && (c.sentStatus || 'Не отправлено') !== fSent) return false;
    const d = iso(c.checkDate);
    if (fFrom && d < fFrom) return false;   // фильтр по дате поверки
    if (fTo && d > fTo) return false;
    return true;
  })
    // Порядок реестра: по возрастанию создания — новые записи и клоны собираются
    // ВНИЗ, порядковый № (индекс+1) продолжается. Печать/экспорт идут в том же
    // порядке и нумеруются 1,2,3… сверху вниз.
    .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  useRowFocus(list.length);   // переход к строке по ?focus=<id> (из Финансов/дашборда)

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

  // ── Оплата по клиенту: данные ──
  const clientsInDir = React.useMemo(() => Array.from(new Set(all.map(c => (c.client || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ru')), [all]);
  const allAccounts = React.useMemo(() => (fin?.accounts || []).filter(a => a.isActive !== false), [fin]);
  const pcAwaiting = React.useMemo(() => fClient ? all.filter(c => (c.client || '') === fClient && c.payStatus !== 'Оплачено') : [], [all, fClient]);
  const pcCount = pcAwaiting.length;
  const pcPriceNum = num(pcPrice);
  const pcIncomeTotal = Math.round(pcPriceNum * pcCount * 100) / 100;
  const pcPayTotal = pcRows.reduce((s, p) => s + num(p.amount), 0);
  const pcMismatch = pcPriceNum > 0 && Math.abs(pcPayTotal - pcIncomeTotal) > 0.01;
  const pcCommPerNum = num(pcCommPer);
  const pcCommTotal = pcCommOn ? Math.round(pcCommPerNum * pcCount * 100) / 100 : 0;
  function openPayClient() {
    if (!fClient) { toast('Сначала выберите клиента в фильтре'); return; }
    if (pcCount === 0) { toast('У клиента нет сертификатов в ожидании'); return; }
    setPcErr(''); setPcPrice(''); setPcRows([{ accountId: defaultAcc?.id || '', amount: '' }]);
    setPcCommOn(true); setPcCommPer('200'); setPcCommAcct(allAccounts.find(a => a.category === 'nalichka')?.id || defaultAcc?.id || allAccounts[0]?.id || '');
    setPcOpen(true);
  }
  async function payClientSubmit() {
    if (pcPriceNum <= 0) { setPcErr('Укажите цену за сертификат'); return; }
    if (pcMismatch) { setPcErr(`Сумма оплат (${fmtNum(pcPayTotal)}) должна равняться итогу (${fmtNum(pcIncomeTotal)})`); return; }
    if (pcCommOn && pcCommPerNum > 0 && !pcCommAcct) { setPcErr('Выберите счёт для выплаты комиссии'); return; }
    setPcSaving(true); setPcErr('');
    try {
      await apiSend('/api/v2/certs/pay-by-client', 'POST', {
        source, docType, client: fClient, pricePerCert: pcPriceNum,
        payments: pcRows.filter(p => p.accountId && num(p.amount) > 0).map(p => ({ accountId: p.accountId, amount: num(p.amount) })),
        commission: pcCommOn && pcCommPerNum > 0 ? { perCert: pcCommPerNum, accountId: pcCommAcct } : null,
      });
      setPcOpen(false); await mutate();
      toast(`✅ Оплачено ${pcCount} серт. на ${fmtNum(pcIncomeTotal)} ₸${pcCommTotal > 0 ? ` · комиссия ${fmtNum(pcCommTotal)} ₸` : ''}`);
    } catch (e) { setPcErr((e as Error).message); } finally { setPcSaving(false); }
  }

  const openNew = () => { setForm(EMPTY); setCloneFrom(''); setErr(''); setModal(true); };
  const fillForm = (c: Cert): typeof EMPTY => ({ id: c.id, fio: c.fio || '', address: c.address || '', phone: c.phone || '', client: c.client || '', meterType: c.meterType || '', serialNo: c.serialNo || '', yearMade: c.yearMade ? String(c.yearMade) : '', waterType: c.waterType || 'х/в', checkDate: iso(c.checkDate), nextCheckDate: iso(c.nextCheckDate), stampNo: c.stampNo || '', sealType: c.sealType === 'ПЛ' ? 'ПЛ' : 'СЛ', readings: c.readings != null ? String(c.readings) : '', result: c.result || 'Годен', operStatus: c.operStatus || 'В работе', payStatus: c.payStatus || 'В ожидании', invoiceType: c.invoiceType || 'Каспи', sentStatus: c.sentStatus || 'Не отправлено', note: c.note || '', amount: c.amount != null ? String(c.amount) : '', accuracyClass: c.accuracyClass || '', ownerKind: c.ownerKind || 'физлицо', ownerTaxId: c.ownerTaxId || '', addressKz: c.addressKz || '', verifier: c.verifier || '' });
  const openEdit = (c: Cert) => { setForm(fillForm(c)); setCloneFrom(''); setErr(''); setModal(true); };
  const openClone = (c: Cert) => { setForm({ ...fillForm(c), id: '', checkDate: '', nextCheckDate: '' }); setCloneFrom(`${c.fio || ''}`); setErr(''); setModal(true); };

  function onCheckDate(v: string) {
    setForm(f => {
      const next = v ? `${Number(v.slice(0, 4)) + 5}${v.slice(4)}` : f.nextCheckDate;
      return { ...f, checkDate: v, nextCheckDate: isCert ? next : f.nextCheckDate };
    });
  }

  function buildBody() {
    const base: Record<string, unknown> = { source, docType, fio: form.fio.trim(), address: form.address || '', phone: form.phone || null, client: form.client || null, meterType: form.meterType || null, serialNo: form.serialNo || null, yearMade: form.yearMade ? Number(form.yearMade) : null, waterType: form.waterType, checkDate: form.checkDate || null, result: form.result, operStatus: form.operStatus, payStatus: form.payStatus, invoiceType: form.invoiceType, note: form.note || null, amount: form.amount ? Number(form.amount) : null, ownerKind: form.ownerKind, ownerTaxId: form.ownerTaxId || null, addressKz: form.addressKz || null, verifier: form.verifier || null, accuracyClass: form.accuracyClass || null };
    // Прямой доход: при «Оплачено» передаём раскладку по счетам (иначе сервер не проведёт).
    // Раскладку шлём только для новой записи или если оплату/цену трогали —
    // иначе сервер не пересобирает уже проведённый доход (правка не-оплатных полей).
    if (isDirect && form.payStatus === 'Оплачено' && (!form.id || payTouched)) base.payments = payRows.filter(p => p.accountId && num(p.amount) > 0).map(p => ({ accountId: p.accountId, amount: num(p.amount) }));
    if (isCert) return { ...base, nextCheckDate: form.nextCheckDate || null, stampNo: form.stampNo || null, sealType: form.sealType, readings: form.readings || null };
    return { ...base, sentStatus: form.sentStatus };
  }
  async function save() {
    if (!form.fio.trim()) { setErr('Укажите ФИО / объект'); return; }
    if (payMismatch) { setErr(`Сумма оплат (${fmtNum(payTotal)}) должна равняться цене (${fmtNum(priceNum)})`); return; }
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

  // ── Экспорт: только 11 нужных колонок (№ · ФИО/объект · Адрес · Тип · Зав.№ ·
  // Поверка · Очередная · Клеймо · Показания · Вода · Год) — без Результат/Оплата/
  // Счёт/Автор. Формы: PDF (печать), CSV, Word.
  const exportRows = (arr: Cert[]) => arr.map((c, i) => [String(i + 1), c.fio || '', c.address || '', c.meterType || '', c.serialNo || '', dmy(c.checkDate), isCert ? dmy(c.nextCheckDate) : '', c.stampNo || '', c.readings != null ? String(c.readings) : '', c.waterType || '', c.yearMade ? String(c.yearMade) : '']);
  const EXP_HEAD = ['№', 'ФИО/объект', 'Адрес', 'Тип', 'Зав.№', 'Поверка', 'Очередная', 'Клеймо', 'Показания', 'Вода', 'Год'];
  // PDF = печать таблицы (браузер → «Сохранить как PDF»); сервер PDF не генерит.
  function printPdf(arr: Cert[], title: string) {
    const esc = (v: unknown) => String(v ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
    const head = EXP_HEAD.map(h => `<th>${esc(h)}</th>`).join('');
    const body = exportRows(arr).map(r => `<tr>${r.map((x, i) => `<td style="text-align:${i === 1 || i === 2 ? 'left' : 'center'}">${esc(x)}</td>`).join('')}</tr>`).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${esc(title)}</title><style>@page{size:A4 landscape;margin:9mm}body{font-family:'Times New Roman',serif;font-size:10.5px}h2{text-align:center;margin:0 0 3px;font-size:15px}table{width:100%;border-collapse:collapse;margin-top:6px}td,th{border:1px solid #000;padding:3px 4px}th{background:#eee}</style></head><body><h2>${esc(title)}</h2><div style="text-align:center;margin-bottom:4px">Направление: ${esc(source)} · записей: ${arr.length}</div><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table><script>window.onload=function(){window.print()}<\/script></body></html>`;
    const w = window.open('', '_blank'); if (w) { w.document.write(html); w.document.close(); } else toast('⚠️ Разрешите всплывающие окна для печати');
  }
  // Единый spec для Word/Excel (11 колонок). ФИО/Адрес — шире и по левому краю.
  const expSpec = (arr: Cert[], title: string, name: string) => ({
    titleLines: [title], subtitle: `Направление: ${source} · записей: ${arr.length}`, orientation: 'landscape',
    columns: EXP_HEAD.map((h, i) => ({ header: h, width: i === 1 || i === 2 ? 22 : 10, align: i === 1 || i === 2 ? 'left' : 'center' })),
    rows: exportRows(arr), filename: name,
  });
  async function exportDoc(endpoint: string, arr: Cert[], title: string, name: string) {
    try {
      const r = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(expSpec(arr, title, name)) });
      if (!r.ok) throw new Error('Ошибка выгрузки');
      const b = await r.blob(); const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(b), download: name });
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (e) { toast('⚠️ ' + (e as Error).message); }
  }
  const exportExcel = (arr: Cert[], title: string, name: string) => exportDoc('/api/v2/xlsx', arr, title, name);
  const exportWord = (arr: Cert[], title: string, name: string) => exportDoc('/api/v2/docx', arr, title, name);

  const Mic = ({ k, h }: { k: keyof typeof EMPTY; h: string }) => <button type="button" className="cert-mic" title={`🎤 ${h}`} onClick={() => voiceField(k, h)}>🎤</button>;
  // Копирование значения поля в буфер — для ручной вставки на сайт е-КТРМ.
  const copyVal = async (v: unknown) => {
    const s = v == null ? '' : String(v).trim();
    if (!s) { toast('Пусто — нечего копировать'); return; }
    try {
      if (!navigator.clipboard?.writeText) throw new Error('no-clipboard');
      await navigator.clipboard.writeText(s);
      toast('📋 Скопировано: ' + (s.length > 24 ? s.slice(0, 24) + '…' : s));
    } catch {
      const ta = document.createElement('textarea'); ta.value = s; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.focus(); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch { /* ignore */ }
      document.body.removeChild(ta);
      toast(ok ? '📋 Скопировано' : '⚠️ Не удалось скопировать');
    }
  };
  const Copy = ({ v, h }: { v: unknown; h?: string }) => <button type="button" className="cert-mic" title={`📋 Копировать${h ? ' — ' + h : ''}`} onClick={() => copyVal(v)}>📋</button>;
  // Инлайн-селект статуса, стилизован как бейдж.
  const SSel = ({ c, field, opts, tone }: { c: Cert; field: keyof Cert; opts: string[]; tone: 'ok' | 'warn' | 'err' | 'info' | 'neutral' }) => (
    <select className={`cert-inline-sel tone-${tone}`} value={(c[field] as string) || opts[0]} onChange={e => patchField(c, field, e.target.value)} title="Изменить">
      {opts.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );

  const cols = useCols('certs', CERT_COLS);
  return (
    <div>
      <PageTitle title={`Поверка — ${isCert ? 'сертификаты' : 'извещения'}`} sub={`Направление: ${source} · записей: ${list.length}`} action={
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {isCert && <ColumnMenu ctl={cols} />}
          <Button variant="outline" onClick={() => printPdf(list, `${isCert ? 'Сертификаты' : 'Извещения'} — ${source}`)}>🖨 PDF</Button>
          <Button variant="outline" onClick={() => exportExcel(list, `${isCert ? 'Сертификаты' : 'Извещения'} — ${source}`, `${isCert ? 'Сертификаты' : 'Извещения'}_${source}.xlsx`)}>⬇ Excel</Button>
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

      <div className="cert-b1-wide">
      <div className="cert-sec-lbl" style={{ marginTop: 14 }}>✏️ Блок 1 · Редактирование</div>
      <Card className="erp-filters" style={{ flexWrap: 'wrap', gap: 8 }}>
        <Badge tone="info">{source}</Badge>
        <Badge tone={isCert ? 'ok' : 'warn'}>{isCert ? '📄 Сертификаты' : '📃 Извещения'}</Badge>
        <Input placeholder="🔍 ФИО, адрес, № счётчика, клиент, телефон" value={q} onChange={e => setQ(e.target.value)} />
        <Select value={fOper} onChange={e => setFOper(e.target.value)}><option value="">Операция: все</option>{OPER.map(o => <option key={o}>{o}</option>)}</Select>
        <Select value={fPay} onChange={e => setFPay(e.target.value)}><option value="">Оплата: все</option>{PAY.map(o => <option key={o}>{o}</option>)}</Select>
        <Select value={fClient} onChange={e => setFClient(e.target.value)} title="Фильтр по клиенту"><option value="">Клиент: все</option>{clientsInDir.map(c => <option key={c} value={c}>{c}</option>)}</Select>
        <Select value={fInv} onChange={e => setFInv(e.target.value)}><option value="">Счёт: все</option>{INV.map(o => <option key={o}>{o}</option>)}</Select>
        <Select value={fWater} onChange={e => setFWater(e.target.value)} title="Тип воды"><option value="">Вода: все</option><option value="х/в">🔵 х/в (холодная)</option><option value="г/в">🔴 г/в (горячая)</option></Select>
        {!isCert && <Select value={fSent} onChange={e => setFSent(e.target.value)}><option value="">Отправка: все</option>{SENT.map(o => <option key={o}>{o}</option>)}</Select>}
        <DateRange from={fFrom} to={fTo} onChange={(f, t) => { setFFrom(f); setFTo(t); }} />
        {isDirect && <Button onClick={openPayClient} title={!fClient ? 'Сначала выберите клиента в фильтре «Клиент»' : pcCount === 0 ? 'Нет сертификатов в ожидании' : `Оплатить ${pcCount} серт.`}>💳 Оплата по клиенту</Button>}
      </Card>

      {isDirect && fClient && (
        <div className="cert-payclient-bar">
          <span>👤 <b>{fClient}</b></span>
          <span className="erp-muted">·</span>
          <span>В ожидании: <b style={{ color: pcCount ? '#b45309' : '#16a34a' }}>{pcCount}</b> из {all.filter(c => (c.client || '') === fClient).length}</span>
          {pcCount > 0 && <Button variant="outline" onClick={openPayClient} style={{ marginLeft: 'auto', fontSize: 12 }}>💳 Принять оплату за {pcCount} серт.</Button>}
        </div>
      )}

      <Card className={`erp-journal ${cols.wrapClass}`} style={{ marginTop: 8, padding: 0 }}>
        {error ? <EmptyRow>Нет доступа к этому направлению.</EmptyRow> : isLoading ? <EmptyRow>Загрузка…</EmptyRow>
          : list.length === 0 ? <EmptyRow>Записей нет. Нажмите «+ {isCert ? 'Сертификат' : 'Извещение'}».</EmptyRow>
          : isCert ? (
            <table className="erp-table cert-reg">
              <thead><tr>
                <th className="col-no">№</th><th className="col-fio">ФИО абонента</th><th className="col-address">Адрес абонента</th><th className="col-meter">Тип прибора</th><th className="col-serial">Заводской номер</th>
                <th className="col-checkdate">Дата поверки</th><th className="col-nextdate">Очередная поверка</th><th className="col-stamp">Номер клейма</th><th className="col-readings" style={{ textAlign: 'right' }}>Показания м³</th>
                <th className="col-water">Вода</th><th className="col-year">Год</th><th className="col-note">Прим.</th><th className="col-phone">Телефон</th><th className="col-client">Клиент</th>
                <th className="col-sum" style={{ textAlign: 'right' }}>💰 Сумма</th><th className="col-oper">🔄 Операция</th><th className="col-pay">💳 Оплата</th><th className="col-invoice">🧾 Счёт</th><th className="col-author">Автор</th><th className="col-actions" style={{ textAlign: 'center' }}>Действия</th>
              </tr></thead>
              <tbody>
                {list.map((c, i) => (
                  <tr key={c.id} data-focus-id={c.id} className={isTTE(c) ? 'cert-hot' : ''}>
                    <td className="erp-muted col-no" style={{ fontSize: 11 }}>{i + 1}</td>
                    <td className="erp-td-main col-fio">{c.fio}</td>
                    <td className="col-address" style={{ fontSize: 11, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.address || '—'}</td>
                    <td className="col-meter"><code className="cert-type">{c.meterType || '—'}</code></td>
                    <td className="col-serial" style={{ fontFamily: 'monospace', fontSize: 11 }}>{c.serialNo || '—'}</td>
                    <td className="col-checkdate" style={{ fontSize: 11 }}>{dmy(c.checkDate)}</td>
                    <td className="col-nextdate" style={{ fontSize: 11 }}><Badge tone="ok">{dmy(c.nextCheckDate)}</Badge></td>
                    <td className="col-stamp" style={{ fontFamily: 'monospace', fontSize: 11 }}>{c.stampNo || '—'}</td>
                    <td className="col-readings" style={{ textAlign: 'right', fontWeight: 600, fontSize: 11 }}>{c.readings != null ? num(c.readings).toLocaleString('ru-RU') : '—'}</td>
                    <td className="col-water" style={{ fontSize: 11 }}>{c.waterType === 'г/в' ? '🔴 г/в' : '🔵 х/в'}</td>
                    <td className="erp-muted col-year" style={{ fontSize: 11 }}>{c.yearMade || '—'}</td>
                    <td className="col-note" style={{ fontSize: 11, color: '#c2410c', fontWeight: 700 }}>{c.note || ''}</td>
                    <td className="erp-muted col-phone" style={{ fontSize: 11 }}>{c.phone || '—'}</td>
                    <td className="col-client" style={{ fontSize: 11 }}>{c.client || '—'}</td>
                    <td className="col-sum" style={{ textAlign: 'right', fontWeight: 700, fontSize: 12 }}>{num(c.amount) > 0 ? fmtNum(num(c.amount)) + ' ₸' : '—'}</td>
                    <td className="col-oper"><SSel c={c} field="operStatus" opts={OPER} tone={operTone(c.operStatus)} /></td>
                    <td className="col-pay"><SSel c={c} field="payStatus" opts={PAY} tone={payTone(c.payStatus)} /></td>
                    <td className="col-invoice"><SSel c={c} field="invoiceType" opts={INV} tone="neutral" /></td>
                    <td className="erp-muted col-author" style={{ fontSize: 11 }}>{c.createdByName || '—'}</td>
                    <td className="col-actions" style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>
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
                <th style={{ textAlign: 'right' }}>💰 Сумма</th><th>🔄 Операция</th><th>💳 Оплата</th><th>🧾 Счёт</th><th>📨 Отправлено</th><th>Автор</th><th style={{ textAlign: 'center' }}>Действия</th>
              </tr></thead>
              <tbody>
                {list.map((c, i) => (
                  <tr key={c.id} data-focus-id={c.id} className={isTTE(c) ? 'cert-hot' : ''}>
                    <td className="erp-muted" style={{ fontSize: 11 }}>{i + 1}</td>
                    <td className="erp-td-main">{c.fio}</td>
                    <td style={{ fontSize: 11 }}>{c.address || '—'}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{c.serialNo || '—'}</td>
                    <td style={{ fontSize: 11 }}>{dmy(c.checkDate)}</td>
                    <td style={{ fontSize: 11 }}>{dmy(c.nextCheckDate)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, fontSize: 12 }}>{num(c.amount) > 0 ? fmtNum(num(c.amount)) + ' ₸' : '—'}</td>
                    <td><SSel c={c} field="operStatus" opts={OPER} tone={operTone(c.operStatus)} /></td>
                    <td><SSel c={c} field="payStatus" opts={PAY} tone={payTone(c.payStatus)} /></td>
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
      </div>

      {isCert && <>
        {/* Блок 2 · Ожидание оплаты */}
        <div className="cert-sec-lbl" style={{ marginTop: 22 }}>⏳ Блок 2 · Ожидание оплаты <span className="erp-muted">· {waiting.length}</span></div>
        <Card><CertAccordion items={waiting} empty="Нет записей в ожидании оплаты." /></Card>

        {/* Блок 3 · Извещение о непригодности */}
        <div className="cert-sec-lbl" style={{ marginTop: 22, display: 'flex', alignItems: 'center' }}>📄 Блок 3 · Извещение о непригодности <span className="erp-muted">· {unfit.length}</span>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <Button variant="outline" onClick={() => exportExcel(unfit, `Извещение о непригодности — ${source}`, `Непригодность_${source}.xlsx`)}>⬇ Excel извещения</Button>
            <Button variant="outline" onClick={() => exportWord(unfit, `Извещение о непригодности — ${source}`, `Непригодность_${source}.docx`)}>⬇ Word</Button>
          </span>
        </div>
        <Card><CertAccordion items={unfit} empty="Непригодных счётчиков нет." /></Card>

        {/* Блок 4 · История */}
        <div className="cert-sec-lbl" style={{ marginTop: 22, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>🗂️ Блок 4 · История <span className="erp-muted">· {histList.length}</span>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <label className="erp-muted" style={{ fontSize: 11 }}>с <input type="date" className="ui-input" value={histFrom} onChange={e => setHistFrom(e.target.value)} style={{ width: 150, display: 'inline-block' }} /></label>
            <label className="erp-muted" style={{ fontSize: 11 }}>по <input type="date" className="ui-input" value={histTo} onChange={e => setHistTo(e.target.value)} style={{ width: 150, display: 'inline-block' }} /></label>
            <Select value={histDays} onChange={e => setHistDays(e.target.value)}><option value="7">Последние 7 дней</option><option value="14">Последние 14 дней</option><option value="30">Последние 30 дней</option><option value="0">Все</option></Select>
          </span>
        </div>
        <Card><CertAccordion items={histList} empty="Нет записей за выбранный период." /></Card>
      </>}

      <Modal open={modal} onClose={() => setModal(false)} width={680}
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>{form.id ? (isCert ? '✏️ Сертификат' : '✏️ Извещение') : `➕ ${isCert ? 'Сертификат' : 'Извещение'} · ${source}`}{cloneFrom && <span className="sale-clone-badge">⧉ на основе {cloneFrom}</span>}</span>}
        footer={<><Button onClick={save} disabled={saving || payMismatch} title={payMismatch ? 'Сумма оплат ≠ цене' : undefined}>{saving ? 'Сохранение…' : payMismatch ? '⚠ Оплата ≠ цене' : '💾 Сохранить'}</Button><Button variant="outline" onClick={() => setModal(false)}>Отмена</Button></>}>
        {err && <div className="erp-form-err">{err}</div>}
        <div className="cert-sec-lbl">📋 Данные {isCert ? 'поверки' : 'извещения'}
          {voiceSupported && <button type="button" className="cert-voice-all" onClick={voiceAll}>🎤 Заполнить голосом</button>}
        </div>
        <div className="erp-form-row">
          <Field label="ФИО абонента" required><div className="cert-vf"><Input value={form.fio} onChange={e => setForm({ ...form, fio: e.target.value })} placeholder="ФИО" /><Mic k="fio" h="ФИО абонента" /><Copy v={form.fio} h="ФИО" /></div></Field>
          <Field label="Адрес"><div className="cert-vf"><Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Адрес" /><Mic k="address" h="Адрес" /><Copy v={form.address} h="Адрес" /></div></Field>
        </div>
        <div className="erp-form-row">
          <Field label="Тип прибора">
            <div className="cert-vf"><div style={{ position: 'relative', flex: 1 }}>
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
            </div><Copy v={form.meterType} h="Тип прибора" /></div>
          </Field>
          <Field label="Заводской номер"><div className="cert-vf"><Input value={form.serialNo} onChange={e => setForm({ ...form, serialNo: e.target.value })} placeholder="Серийный номер" style={{ fontFamily: 'monospace' }} /><Mic k="serialNo" h="Номер счётчика" /><Copy v={form.serialNo} h="Зав. №" /></div></Field>
        </div>
        <div className="erp-form-row">
          <Field label="Дата поверки"><div className="cert-vf"><Input type="date" value={form.checkDate} onChange={e => onCheckDate(e.target.value)} /><Copy v={form.checkDate ? dmy(form.checkDate) : ''} h="Дата поверки" /></div></Field>
          {isCert
            ? <Field label="Дата очередной поверки"><div className="cert-vf"><Input type="date" value={form.nextCheckDate} onChange={e => setForm({ ...form, nextCheckDate: e.target.value })} /><Copy v={form.nextCheckDate ? dmy(form.nextCheckDate) : ''} h="След. поверка" /></div></Field>
            : <Field label="Гор/хол вода"><div className="cert-vf"><Select value={form.waterType} onChange={e => setForm({ ...form, waterType: e.target.value })}><option>х/в</option><option>г/в</option></Select><Copy v={form.waterType} h="Вода" /></div></Field>}
        </div>
        {isCert && (<>
          <div className="erp-form-row">
            <Field label="№ клейма"><div className="cert-vf"><Input value={form.stampNo} onChange={e => setForm({ ...form, stampNo: e.target.value })} placeholder="0000000" style={{ fontFamily: 'monospace' }} /><Mic k="stampNo" h="Номер клейма" /><Copy v={form.stampNo} h="№ клейма" /></div></Field>
            <Field label="Тип поверительного клейма">
              <div className="cert-seal">
                <label><input type="radio" name="sealType" checked={form.sealType === 'СЛ'} onChange={() => setForm({ ...form, sealType: 'СЛ' })} /> Самоклеющийся лейбл (СЛ)</label>
                <label><input type="radio" name="sealType" checked={form.sealType === 'ПЛ'} onChange={() => setForm({ ...form, sealType: 'ПЛ' })} /> Пластиковое пломбо (ПЛ)</label>
              </div>
            </Field>
          </div>
          <div className="erp-form-row">
            <Field label="Показания м³"><div className="cert-vf"><Input type="number" value={form.readings} onChange={e => setForm({ ...form, readings: e.target.value })} /><Mic k="readings" h="Показания в кубометрах" /><Copy v={form.readings} h="Показания" /></div></Field>
            <Field label="Тип воды"><div className="cert-vf"><Select value={form.waterType} onChange={e => setForm({ ...form, waterType: e.target.value })}><option>х/в</option><option>г/в</option></Select><Copy v={form.waterType} h="Вода" /></div></Field>
          </div>
        </>)}
        <div className="erp-form-row">
          <Field label="Результат поверки"><Select value={form.result} onChange={e => setForm({ ...form, result: e.target.value })}><option value="Годен">✅ Годен</option><option value="Не годен">⛔ Не годен</option></Select></Field>
          <Field label="Год выпуска"><div className="cert-vf"><Input type="number" value={form.yearMade} onChange={e => setForm({ ...form, yearMade: e.target.value })} placeholder="2020" /><Mic k="yearMade" h="Год выпуска" /><Copy v={form.yearMade} h="Год выпуска" /></div></Field>
        </div>
        <div className="erp-form-row">
          <Field label="Телефон (не печатается)"><div className="cert-vf"><Input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+7 700 000 00 00" /><Mic k="phone" h="Телефон" /></div></Field>
          <Field label="Клиент">
            <ClientPicker clients={clients || []} kind="client" onPick={c => setForm(f => ({ ...f, client: c.name }))} onCreated={() => mutateClients()} />
            <div className="cert-vf" style={{ marginTop: 6 }}><Input value={form.client} onChange={e => setForm({ ...form, client: e.target.value })} placeholder="Название клиента / ТОО" /><Mic k="client" h="Клиент" /></div>
          </Field>
        </div>
        <Field label="Примечание"><div className="cert-vf"><Input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="ТТЭ и др." /><Mic k="note" h="Примечание" /></div></Field>

        <div className="cert-sec-lbl">🏛️ Для е-КТРМ</div>
        <div className="erp-form-row">
          <Field label="Поверитель">
            <Select value={form.verifier} onChange={e => setForm({ ...form, verifier: e.target.value })}>
              <option value="">— выберите —</option>
              {VERIFIERS.map(v => <option key={v}>{v}</option>)}
            </Select>
          </Field>
          <Field label="Класс точности">
            <Input value={form.accuracyClass} onChange={e => setForm({ ...form, accuracyClass: e.target.value })} placeholder="±5; ±2" />
          </Field>
        </div>
        <div className="erp-form-row">
          <Field label="Владелец прибора">
            <Select value={form.ownerKind} onChange={e => setForm({ ...form, ownerKind: e.target.value })}>
              <option value="физлицо">Физическое лицо</option>
              <option value="юрлицо">Юридическое лицо</option>
            </Select>
          </Field>
          <Field label={form.ownerKind === 'юрлицо' ? 'БИН' : 'ИИН'}>
            <Input
              value={form.ownerTaxId}
              onChange={e => setForm({ ...form, ownerTaxId: e.target.value.replace(/\D/g, '').slice(0, 12) })}
              placeholder="12 цифр"
              inputMode="numeric"
              style={{ fontFamily: 'monospace' }}
            />
          </Field>
        </div>
        <Field label="Адрес на казахском">
          <Input value={form.addressKz} onChange={e => setForm({ ...form, addressKz: e.target.value })} placeholder="Тараз қ., Айтиев к-сі, 27 үй, 46 пәтер" />
        </Field>

        <div className="cert-sec-lbl">🔄 Статусы</div>
        <div className="erp-form-row" style={{ gridTemplateColumns: isCert ? '1fr 1fr 1fr' : '1fr 1fr 1fr 1fr' }}>
          <Field label="Операция"><Select value={form.operStatus} onChange={e => setForm({ ...form, operStatus: e.target.value })}>{OPER.map(o => <option key={o}>{o}</option>)}</Select></Field>
          <Field label="Оплата"><Select value={form.payStatus} onChange={e => setForm({ ...form, payStatus: e.target.value })}>{PAY.map(o => <option key={o}>{o}</option>)}</Select></Field>
          <Field label="Счёт"><Select value={form.invoiceType} onChange={e => setForm({ ...form, invoiceType: e.target.value })}>{INV.map(o => <option key={o}>{o}</option>)}</Select></Field>
          {!isCert && <Field label="Отправка"><Select value={form.sentStatus} onChange={e => setForm({ ...form, sentStatus: e.target.value })}>{SENT.map(o => <option key={o}>{o}</option>)}</Select></Field>}
        </div>

        {isDirect ? (
          <>
            <div className="cert-sec-lbl">💳 Оплата (доход)</div>
            <div className="erp-form-row">
              <Field label="Цена, ₸"><MoneyInput value={form.amount} onValue={v => { setPayTouched(true); setForm({ ...form, amount: v }); }} placeholder="0" /></Field>
              <div />
            </div>
            {form.payStatus === 'Оплачено' && (
              <div className="sale-pay" style={{ marginTop: 0 }}>
                <div className="erp-muted" style={{ fontSize: 11, marginBottom: 6 }}>Счета раздела «{certSection === 'branch' ? '№4 Филиал Астана' : '№1 Поверка'}». Одна строка — вся цена на один счёт; можно разбить (смешанная).</div>
                {payRows.map((p, i) => (
                  <div className="sale-pay-row" key={i}>
                    <Select value={p.accountId} onChange={e => setPay(rs => rs.map((r, j) => j === i ? { ...r, accountId: e.target.value } : r))}>
                      <option value="">{secAccounts.length ? '— счёт —' : '— нет счетов раздела —'}</option>
                      {secAccounts.map(a => <option key={a.id} value={a.id}>{a.icon || '💳'} {a.name}</option>)}
                    </Select>
                    <MoneyInput value={p.amount} onValue={v => setPay(rs => rs.map((r, j) => j === i ? { ...r, amount: v } : r))} placeholder="сумма" style={{ textAlign: 'right' }} />
                    <button type="button" className="erp-icon-btn" style={{ color: '#dc2626' }} onClick={() => setPay(rs => rs.length > 1 ? rs.filter((_, j) => j !== i) : rs)} title="Убрать">✕</button>
                  </div>
                ))}
                <Button variant="outline" onClick={() => setPay(rs => [...rs, { accountId: defaultAcc?.id || '', amount: '' }])} style={{ fontSize: 12 }}>+ ещё счёт</Button>
                <div className="sale-pay-state">
                  <span>Внесено: <b style={{ color: payMismatch ? '#b45309' : '#16a34a' }}>{fmtNum(payTotal)} ₸</b></span>
                  <span>Цена: <b>{fmtNum(priceNum)} ₸</b></span>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="cert-sec-lbl">💳 Оплата (выездная)</div>
            <div className="erp-form-row">
              <Field label="Сумма, ₸"><MoneyInput value={form.amount} onValue={v => setForm({ ...form, amount: v })} placeholder="0" /></Field>
              <div />
            </div>
            <div className="erp-muted" style={{ fontSize: 11, marginTop: 4 }}>ℹ️ Сумма пришла из кабинета мастера (цена поверки). Приём денег проводит мастер — приход по заявке на выбранный им счёт. Здесь сумму можно поправить.</div>
          </>
        )}

        {form.id && <EntityHistory entityType="certificate" entityId={form.id} />}
      </Modal>

      {/* Модалка «Оплата по клиенту» */}
      <Modal open={pcOpen} onClose={() => setPcOpen(false)} width={560}
        title={<span>💳 Оплата по клиенту — {fClient}</span>}
        footer={<><Button onClick={payClientSubmit} disabled={pcSaving || pcMismatch || pcPriceNum <= 0} title={pcMismatch ? 'Сумма оплат ≠ итогу' : undefined}>{pcSaving ? 'Проведение…' : pcMismatch ? '⚠ Оплата ≠ итогу' : '💾 Провести оплату'}</Button><Button variant="outline" onClick={() => setPcOpen(false)}>Отмена</Button></>}>
        {pcErr && <div className="erp-form-err">{pcErr}</div>}
        <div className="erp-muted" style={{ fontSize: 13, marginBottom: 4 }}>
          Сертификатов в ожидании: <b style={{ color: '#b45309' }}>{pcCount}</b> · итог = цена × {pcCount} = <b style={{ color: '#16a34a' }}>{fmtNum(pcIncomeTotal)} ₸</b>
        </div>

        <div className="cert-sec-lbl">💳 Оплата (доход)</div>
        <div className="erp-form-row">
          <Field label="Цена за сертификат, ₸"><MoneyInput value={pcPrice} onValue={setPcPrice} placeholder="0" autoFocus /></Field>
          <Field label="Итого к оплате"><Input value={`${fmtNum(pcIncomeTotal)} ₸`} readOnly style={{ background: '#f8fafc', fontWeight: 700 }} /></Field>
        </div>
        <div className="sale-pay" style={{ marginTop: 0 }}>
          <div className="erp-muted" style={{ fontSize: 11, marginBottom: 6 }}>Счета раздела «{certSection === 'branch' ? '№4 Филиал Астана' : '№1 Поверка'}». Одна строка — весь итог на один счёт; можно разбить (смешанная).</div>
          {pcRows.map((p, i) => (
            <div className="sale-pay-row" key={i}>
              <Select value={p.accountId} onChange={e => setPcRows(rs => rs.map((r, j) => j === i ? { ...r, accountId: e.target.value } : r))}>
                <option value="">{secAccounts.length ? '— счёт —' : '— нет счетов раздела —'}</option>
                {secAccounts.map(a => <option key={a.id} value={a.id}>{a.icon || '💳'} {a.name}</option>)}
              </Select>
              <MoneyInput value={p.amount} onValue={v => setPcRows(rs => rs.map((r, j) => j === i ? { ...r, amount: v } : r))} placeholder="сумма" style={{ textAlign: 'right' }} />
              <button type="button" className="erp-icon-btn" style={{ color: '#dc2626' }} onClick={() => setPcRows(rs => rs.length > 1 ? rs.filter((_, j) => j !== i) : rs)} title="Убрать">✕</button>
            </div>
          ))}
          <Button variant="outline" onClick={() => setPcRows(rs => [...rs, { accountId: defaultAcc?.id || '', amount: '' }])} style={{ fontSize: 12 }}>+ ещё счёт</Button>
          <div className="sale-pay-state">
            <span>Внесено: <b style={{ color: pcMismatch ? '#b45309' : '#16a34a' }}>{fmtNum(pcPayTotal)} ₸</b></span>
            <span>Итог: <b>{fmtNum(pcIncomeTotal)} ₸</b></span>
          </div>
        </div>

        <div className="cert-sec-lbl" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: 400 }}>
            <input type="checkbox" checked={pcCommOn} onChange={e => setPcCommOn(e.target.checked)} /> 🎁 Выплата комиссии клиенту
          </label>
        </div>
        {pcCommOn && (
          <>
            <div className="erp-form-row">
              <Field label="Комиссия за сертификат, ₸"><MoneyInput value={pcCommPer} onValue={setPcCommPer} placeholder="200" /></Field>
              <Field label="Со счёта"><Select value={pcCommAcct} onChange={e => setPcCommAcct(e.target.value)}><option value="">— счёт —</option>{allAccounts.map(a => <option key={a.id} value={a.id}>{a.icon || '💳'} {a.name}</option>)}</Select></Field>
            </div>
            <div className="sale-pay-state">
              <span className="erp-muted">Выплата = {fmtNum(pcCommPerNum)} × {pcCount}</span>
              <span>К выплате: <b style={{ color: '#dc2626' }}>−{fmtNum(pcCommTotal)} ₸</b></span>
            </div>
          </>
        )}
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
