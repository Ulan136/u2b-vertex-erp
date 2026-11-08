'use client';
import * as React from 'react';
import {
  CITIES, cityCenter, cityLabel, cityOfBranch, cityOfCoords, splitAddress, joinAddress,
  tidyAddress, gisViewUrl, yandexViewUrl, type CityKey, type AddrParts,
} from '@/lib/geo';

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global { interface Window { ymaps?: any } }

// Единая загрузка JS API Яндекс.Карт (2.1). Ключ — публичный (ограничен доменом),
// хранится в «Настройки → Организация» и приходит с /api/v2/org.
// Грузим ТОЛЬКО когда менеджер открыл карту: раньше карта висела под полем
// адреса всегда, и каждое открытие заявки тянуло ~1 МБ скриптов впустую.
let loadPromise: Promise<any> | null = null;
function loadYmaps(apiKey: string): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('SSR'));
  if (window.ymaps && window.ymaps.Map) return Promise.resolve(window.ymaps);
  if (!loadPromise) {
    loadPromise = new Promise((resolve, reject) => {
      const ready = () => window.ymaps.ready(() => resolve(window.ymaps));
      const existing = document.getElementById('ymaps-js') as HTMLScriptElement | null;
      if (existing) { existing.addEventListener('load', ready); existing.addEventListener('error', () => reject(new Error('load'))); return; }
      const s = document.createElement('script');
      s.id = 'ymaps-js';
      s.src = `https://api-maps.yandex.ru/2.1/?apikey=${encodeURIComponent(apiKey)}&lang=ru_RU`;
      s.async = true;
      s.onload = ready;
      s.onerror = () => { loadPromise = null; reject(new Error('Не удалось загрузить Яндекс.Карты')); };
      document.head.appendChild(s);
    });
  }
  return loadPromise;
}

export type GeoValue = { address: string; lat: number | null; lng: number | null };

// Поле адреса: обычная строка + кнопка «С карты» (открывает окно Яндекса) +
// быстрые ссылки «открыть в 2ГИС / Яндексе». Карта в самом поле НЕ висит.
// `branch` задаёт город по умолчанию (slug из ?branch= или раздел счёта филиала).
export default function YandexAddressPicker({ apiKey, address, lat, lng, onChange, placeholder, branch }: {
  apiKey?: string | null;
  address: string;
  lat: number | null;
  lng: number | null;
  onChange: (v: GeoValue) => void;
  placeholder?: string;
  branch?: string | null;
}) {
  const [open, setOpen] = React.useState(false);
  const pinned = lat != null && lng != null;

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          className="ui-input"
          style={{ flex: 1 }}
          value={address}
          onChange={(e) => onChange({ address: e.target.value, lat, lng })}
          placeholder={placeholder || 'Адрес — введите или выберите на карте'}
          autoComplete="off"
        />
        <button
          type="button"
          className="erp-chip"
          style={{ whiteSpace: 'nowrap', flex: 'none' }}
          disabled={!apiKey}
          title={apiKey ? 'Выбрать адрес на карте Яндекса' : 'Добавьте ключ Яндекс.Карт в «Настройки → Организация»'}
          onClick={() => setOpen(true)}
        >🗺️ С карты</button>
      </div>

      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
        {address.trim() ? (
          <>
            <span className="erp-muted" style={{ fontSize: 11 }}>Открыть:</span>
            <a className="erp-chip" href={gisViewUrl(address, lat, lng)} target="_blank" rel="noopener noreferrer"
              style={{ textDecoration: 'none' }} title="Открыть адрес в 2ГИС">🧭 2ГИС</a>
            <a className="erp-chip" href={yandexViewUrl(address, lat, lng)} target="_blank" rel="noopener noreferrer"
              style={{ textDecoration: 'none' }} title="Открыть адрес в Яндекс.Картах">🗺️ Яндекс</a>
          </>
        ) : null}
        <span className="erp-muted" style={{ fontSize: 11, marginLeft: 'auto' }}>
          {pinned ? `📍 ${lat!.toFixed(5)}, ${lng!.toFixed(5)}` : !apiKey ? 'Карта отключена: нет ключа Яндекс.Карт' : 'Метки нет — мастер поедет поиском по строке'}
        </span>
      </div>

      {open && (
        <MapPickerWindow
          apiKey={String(apiKey)}
          address={address}
          lat={lat}
          lng={lng}
          branch={branch}
          onClose={() => setOpen(false)}
          onApply={(v) => { onChange(v); setOpen(false); }}
        />
      )}
    </div>
  );
}

// ── Окно «Адрес с карты» ─────────────────────────────────────
// Отдельный оверлей, а не <Modal>: окно открывается ПОВЕРХ модалки заявки
// (z-index выше 50) и гасит у себя Enter, иначе обработчик модалки заявки
// перескакивал бы по её полям, пока менеджер ищет улицу.
function MapPickerWindow({ apiKey, address, lat, lng, branch, onApply, onClose }: {
  apiKey: string;
  address: string;
  lat: number | null;
  lng: number | null;
  branch?: string | null;
  onApply: (v: GeoValue) => void;
  onClose: () => void;
}) {
  const [parts, setParts] = React.useState<AddrParts>(() => splitAddress(address));
  const [city, setCity] = React.useState<CityKey>(() => cityOfCoords(lat, lng) || cityOfBranch(branch));
  const [pt, setPt] = React.useState<{ lat: number | null; lng: number | null }>({ lat, lng });
  const [err, setErr] = React.useState('');
  const [ready, setReady] = React.useState(false);
  const [q, setQ] = React.useState('');
  const [hints, setHints] = React.useState<{ line: string; coords: [number, number] }[]>([]);

  const mapRef = React.useRef<HTMLDivElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const objRef = React.useRef<{ ymaps?: any; map?: any; mark?: any }>({});
  // Актуальное состояние для колбэков карты: они создаются один раз, а читать
  // должны свежие значения (иначе подъезд/кв. затираются старыми).
  const liveRef = React.useRef({ parts, city });
  liveRef.current = { parts, city };

  const setBase = React.useCallback((base: string) => setParts(p => ({ ...p, base })), []);

  // Поставить метку + адрес (из обратного геокодирования или из подсказки).
  const place = React.useCallback((coords: [number, number], line?: string) => {
    const o = objRef.current;
    if (o.map && o.mark && !o.map.geoObjects.getLength()) o.map.geoObjects.add(o.mark);
    o.mark?.geometry.setCoordinates(coords);
    setPt({ lat: coords[0], lng: coords[1] });
    if (line) setBase(tidyAddress(line));
  }, [setBase]);

  const reverse = React.useCallback((coords: [number, number]) => {
    const o = objRef.current;
    place(coords);
    o.ymaps?.geocode(coords, { results: 1 }).then((res: any) => {
      const g = res.geoObjects.get(0);
      if (g) setBase(tidyAddress(g.getAddressLine()));
    }).catch(() => { /* адрес останется прежним — координаты уже стоят */ });
  }, [place, setBase]);

  // Поиск по строке: ищем ВНУТРИ текущего города (boundedBy), иначе «Абая»
  // находится сразу в трёх городах и метка улетает не туда.
  const search = React.useCallback((query: string) => {
    const o = objRef.current;
    const q = query.trim();
    if (!q || !o.ymaps || !o.map) return;
    o.ymaps.geocode(`${CITIES.find(c => c.key === liveRef.current.city)?.label}, ${q}`, {
      results: 1, boundedBy: o.map.getBounds(), strictBounds: false,
    }).then((res: any) => {
      const g = res.geoObjects.get(0);
      if (!g) { setErr('Адрес не найден — поставьте метку на карте'); return; }
      setErr('');
      const coords = g.geometry.getCoordinates() as [number, number];
      o.map.setCenter(coords, 17);
      place(coords, g.getAddressLine());
    }).catch(() => setErr('Поиск не ответил — поставьте метку на карте'));
  }, [place]);

  // Подсказки при вводе. Раньше здесь был ymaps.SuggestView — он требует
  // ТРЕТЬЕГО продукта Яндекса (Геосаджест) и без него валится
  // FeatureRemovedError. Варианты берём из геокодера, который уже подключён:
  // один запрос на паузу в наборе, а не на каждую букву.
  const lookup = React.useCallback((query: string) => {
    const o = objRef.current;
    if (!o.ymaps || !o.map) return;
    o.ymaps.geocode(`${cityLabel(liveRef.current.city)}, ${query}`, {
      results: 6, boundedBy: o.map.getBounds(), strictBounds: false,
    }).then((res: any) => {
      const list: { line: string; coords: [number, number] }[] = [];
      res.geoObjects.each((g: any) => {
        list.push({ line: tidyAddress(g.getAddressLine()), coords: g.geometry.getCoordinates() });
      });
      setHints(list);
    }).catch(() => setHints([]));   // молча: подсказки — удобство, а не обязанность
  }, []);

  // Ждём паузу в наборе: иначе на «Казыбек би 103» ушло бы 13 запросов из
  // суточной тысячи. Короткие строки не ищем — по «ул» осмысленного ответа нет.
  React.useEffect(() => {
    const s = q.trim();
    if (s.length < 4) { setHints([]); return; }
    const t = setTimeout(() => lookup(s), 600);
    return () => clearTimeout(t);
  }, [q, lookup]);

  const takeHint = React.useCallback((h: { line: string; coords: [number, number] }) => {
    setHints([]);
    setQ(h.line);
    setErr('');
    objRef.current.map?.setCenter(h.coords, 17);
    place(h.coords, h.line);
  }, [place]);

  React.useEffect(() => {
    let destroyed = false;
    loadYmaps(apiKey).then((ymaps) => {
      if (destroyed || !mapRef.current) return;
      const start: [number, number] = lat != null && lng != null ? [lat, lng] : cityCenter(city);
      const map = new ymaps.Map(mapRef.current, {
        center: start, zoom: lat != null ? 17 : 12, controls: ['zoomControl', 'geolocationControl', 'typeSelector'],
      });
      const mark = new ymaps.Placemark(start, {}, { draggable: true, preset: 'islands#redDotIcon' });
      if (lat != null && lng != null) map.geoObjects.add(mark);
      objRef.current = { ymaps, map, mark };

      map.events.add('click', (e: any) => reverse(e.get('coords')));
      mark.events.add('dragend', () => reverse(mark.geometry.getCoordinates()));

      setReady(true);
    }).catch((e) => setErr(e?.message || 'Ошибка карты'));

    return () => {
      destroyed = true;
      try { objRef.current.map?.destroy(); } catch { /* ignore */ }
      objRef.current = {};
    };
    // Создаём карту один раз на открытие окна: пересборка на каждое нажатие
    // в поле «подъезд» сбрасывала бы зум и метку.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  function pickCity(k: CityKey) {
    setCity(k);
    objRef.current.map?.setCenter(cityCenter(k), 12);
  }

  const full = joinAddress(parts);
  const canApply = !!parts.base.trim();

  return (
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => {
        // Enter и Esc не должны доходить до модалки заявки.
        if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
        if (e.key === 'Enter') e.stopPropagation();
      }}
      style={{
        position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(15,23,42,.55)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 12px', overflowY: 'auto',
      }}
    >
      <div style={{ width: 620, maxWidth: '96vw', background: '#fff', borderRadius: 16, boxShadow: '0 24px 70px rgba(0,0,0,.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--erp-line)' }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>🗺️ Адрес с карты</h3>
          <button type="button" className="ui-modal-close" onClick={onClose} aria-label="Закрыть">✕</button>
        </div>

        <div style={{ padding: '12px 18px' }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
            {CITIES.map(c => (
              <button
                key={c.key}
                type="button"
                className="erp-chip"
                onClick={() => pickCity(c.key)}
                style={city === c.key
                  ? { background: '#2563eb', borderColor: '#2563eb', color: '#fff', fontWeight: 700 }
                  : undefined}
              >{c.label}</button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            <input
              ref={searchRef}
              className="ui-input"
              style={{ flex: 1 }}
              placeholder="🔍 Улица и дом — например «Толе би 1»"
              autoComplete="off"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); setHints([]); search(q); }
                if (e.key === 'Escape' && hints.length) { e.stopPropagation(); setHints([]); }
              }}
            />
            <button type="button" className="erp-chip" style={{ flex: 'none' }}
              onClick={() => { setHints([]); search(q); }}>Найти</button>
          </div>

          {/* Выпадающий список вариантов: менеджер выбирает нужный дом, не
              доверяя первому попавшемуся — одноимённых улиц в городе хватает. */}
          {hints.length > 0 && (
            <div style={{ position: 'relative' }}>
              <div style={{
                position: 'absolute', left: 0, right: 0, top: 2, zIndex: 5, background: '#fff',
                border: '1px solid var(--erp-line)', borderRadius: 10, overflow: 'hidden',
                boxShadow: '0 12px 34px rgba(0,0,0,.16)',
              }}>
                {hints.map((h, i) => (
                  <button
                    key={`${h.line}-${i}`}
                    type="button"
                    onClick={() => takeHint(h)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px',
                      background: 'none', border: 'none', borderTop: i ? '1px solid var(--erp-line)' : 'none',
                      cursor: 'pointer', fontSize: 13,
                    }}
                  >{h.line}</button>
                ))}
              </div>
            </div>
          )}

          {err && <div className="erp-form-err" style={{ marginTop: 8 }}>{err}</div>}

          <div ref={mapRef} style={{ height: 300, marginTop: 10, borderRadius: 10, overflow: 'hidden', background: '#eef2f7' }} />
          <div className="erp-muted" style={{ fontSize: 11, marginTop: 4 }}>
            {ready ? 'Кликните по дому или перетащите метку — адрес подставится сам.' : 'Загрузка карты…'}
          </div>

          {/* Подъезд/этаж/квартиру геокодер не знает — их вписывает менеджер. */}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <label style={{ flex: 1 }}>
              <div className="erp-muted" style={{ fontSize: 11, marginBottom: 3 }}>Подъезд</div>
              <input className="ui-input" value={parts.entrance} onChange={e => setParts({ ...parts, entrance: e.target.value })} placeholder="3" />
            </label>
            <label style={{ flex: 1 }}>
              <div className="erp-muted" style={{ fontSize: 11, marginBottom: 3 }}>Этаж</div>
              <input className="ui-input" value={parts.floor} onChange={e => setParts({ ...parts, floor: e.target.value })} placeholder="5" />
            </label>
            <label style={{ flex: 1 }}>
              <div className="erp-muted" style={{ fontSize: 11, marginBottom: 3 }}>Кв. / офис</div>
              <input className="ui-input" value={parts.flat} onChange={e => setParts({ ...parts, flat: e.target.value })} placeholder="51" />
            </label>
          </div>

          <label style={{ display: 'block', marginTop: 10 }}>
            <div className="erp-muted" style={{ fontSize: 11, marginBottom: 3 }}>Улица и дом (можно поправить руками)</div>
            <input className="ui-input" value={parts.base} onChange={e => setBase(e.target.value)} placeholder="Астана, улица Кенесары, 42" />
          </label>

          <div style={{ background: '#f6f8fb', border: '1px solid var(--erp-line)', borderRadius: 10, padding: '9px 12px', marginTop: 10 }}>
            <div className="erp-muted" style={{ fontSize: 11 }}>Получится</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{full || '—'}</div>
            <div className="erp-muted" style={{ fontSize: 11, marginTop: 2 }}>
              {pt.lat != null && pt.lng != null
                ? `📍 ${pt.lat.toFixed(5)}, ${pt.lng.toFixed(5)} — мастер поедет на метку`
                : '⚠️ Метки нет — мастер поедет поиском по строке адреса'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '12px 18px', borderTop: '1px solid var(--erp-line)' }}>
          <button type="button" className="erp-chip" onClick={onClose}>Отмена</button>
          <button
            type="button"
            className="erp-chip"
            disabled={!canApply}
            style={canApply ? { background: '#2563eb', borderColor: '#2563eb', color: '#fff', fontWeight: 700 } : undefined}
            onClick={() => onApply({ address: full, lat: pt.lat, lng: pt.lng })}
          >Подставить адрес</button>
        </div>
      </div>
    </div>
  );
}
