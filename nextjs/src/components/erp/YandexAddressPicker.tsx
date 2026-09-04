'use client';
import * as React from 'react';

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global { interface Window { ymaps?: any } }

// Единая загрузка JS API Яндекс.Карт (2.1). Ключ — публичный (ограничен доменом),
// хранится в «Настройки → Организация» и приходит с /api/v2/org.
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

const ASTANA: [number, number] = [51.1282, 71.4307];   // центр Астаны по умолчанию

export type GeoValue = { address: string; lat: number | null; lng: number | null };

// Поле адреса с картой: ввод с автоподсказкой (Yandex Suggest) + клик по карте /
// перетаскивание метки → адрес + координаты. Если ключа нет — обычное текстовое поле.
export default function YandexAddressPicker({ apiKey, address, lat, lng, onChange, placeholder }: {
  apiKey?: string | null;
  address: string;
  lat: number | null;
  lng: number | null;
  onChange: (v: GeoValue) => void;
  placeholder?: string;
}) {
  const mapRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const stateRef = React.useRef({ address, lat, lng });
  stateRef.current = { address, lat, lng };
  const [err, setErr] = React.useState('');
  const [ready, setReady] = React.useState(false);
  const objRef = React.useRef<{ map?: any; mark?: any; suggest?: any }>({});

  React.useEffect(() => {
    if (!apiKey) return;
    let destroyed = false;
    const o = objRef.current;
    loadYmaps(apiKey).then((ymaps) => {
      if (destroyed || !mapRef.current) return;
      const s = stateRef.current;
      const center: [number, number] = s.lat != null && s.lng != null ? [s.lat, s.lng] : ASTANA;
      const map = new ymaps.Map(mapRef.current, { center, zoom: 12, controls: ['zoomControl', 'geolocationControl'] });
      const mark = new ymaps.Placemark(center, {}, { draggable: true, preset: 'islands#redDotIcon' });
      if (s.lat != null && s.lng != null) map.geoObjects.add(mark);
      o.map = map; o.mark = mark;

      const apply = (coords: [number, number], addr?: string) => {
        if (!map.geoObjects.getLength()) map.geoObjects.add(mark);
        mark.geometry.setCoordinates(coords);
        onChange({ address: addr ?? stateRef.current.address, lat: coords[0], lng: coords[1] });
      };
      const reverse = (coords: [number, number]) => {
        ymaps.geocode(coords, { results: 1 }).then((res: any) => {
          const g = res.geoObjects.get(0);
          apply(coords, g ? g.getAddressLine() : undefined);
        }).catch(() => apply(coords));
      };
      map.events.add('click', (e: any) => reverse(e.get('coords')));
      mark.events.add('dragend', () => reverse(mark.geometry.getCoordinates()));

      // Автоподсказка адреса в текстовом поле
      if (inputRef.current) {
        const suggest = new ymaps.SuggestView(inputRef.current, { results: 6 });
        suggest.events.add('select', (e: any) => {
          const value = e.get('item').value as string;
          ymaps.geocode(value, { results: 1 }).then((res: any) => {
            const g = res.geoObjects.get(0);
            if (!g) return;
            const coords = g.geometry.getCoordinates() as [number, number];
            map.setCenter(coords, 16);
            apply(coords, value);
          });
        });
        o.suggest = suggest;
      }
      setReady(true);
    }).catch((e) => setErr(e?.message || 'Ошибка карты'));

    return () => {
      destroyed = true;
      try { objRef.current.map?.destroy(); } catch { /* ignore */ }
      objRef.current = {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  return (
    <div>
      <input
        ref={inputRef}
        className="ui-input"
        value={address}
        onChange={(e) => onChange({ address: e.target.value, lat: stateRef.current.lat, lng: stateRef.current.lng })}
        placeholder={placeholder || 'Адрес — начните вводить или выберите на карте'}
        autoComplete="off"
      />
      {!apiKey ? (
        <div className="erp-muted" style={{ fontSize: 11, marginTop: 4 }}>🗺️ Карта отключена: добавьте ключ Яндекс.Карт в «Настройки → Организация».</div>
      ) : err ? (
        <div className="erp-muted" style={{ fontSize: 11, marginTop: 4, color: '#dc2626' }}>⚠️ {err}. Адрес можно ввести вручную.</div>
      ) : (
        <>
          <div ref={mapRef} style={{ height: 260, marginTop: 6, borderRadius: 10, overflow: 'hidden', background: '#eef2f7' }} />
          <div className="erp-muted" style={{ fontSize: 11, marginTop: 4 }}>
            {ready ? 'Кликните по карте или перетащите метку — адрес и координаты сохранятся.' : 'Загрузка карты…'}
            {lat != null && lng != null ? ` · 📍 ${lat.toFixed(5)}, ${lng.toFixed(5)}` : ''}
          </div>
        </>
      )}
    </div>
  );
}
