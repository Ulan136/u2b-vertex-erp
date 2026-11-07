import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CITIES, cityCenter, cityLabel, cityOfBranch, cityOfCoords,
  splitAddress, joinAddress, gisViewUrl, yandexViewUrl, gisRouteUrl, yandexRouteUrl,
  tidyAddress,
} from './geo';

test('CITIES: три города, центры не перепутаны', () => {
  assert.deepEqual(CITIES.map(c => c.key), ['taraz', 'astana', 'almaty']);
  // У Тараза и Астаны почти одинаковая ДОЛГОТА (~71.4) — их легко спутать,
  // различает только широта. Проверяем именно её.
  assert.ok(cityCenter('taraz')[0] < 43, 'Тараз южнее 43°');
  assert.ok(cityCenter('astana')[0] > 51, 'Астана севернее 51°');
  assert.ok(cityCenter('almaty')[1] > 76, 'Алматы восточнее 76°');
  assert.equal(cityLabel('almaty'), 'Алматы');
});

test('cityOfBranch: и slug из URL, и раздел счёта филиала', () => {
  assert.equal(cityOfBranch('astana'), 'astana');
  assert.equal(cityOfBranch('branch'), 'astana');
  assert.equal(cityOfBranch('almaty'), 'almaty');
  assert.equal(cityOfBranch('branch_almaty'), 'almaty');
  // Головной офис и всё неизвестное — Тараз.
  for (const v of ['', null, undefined, 'head', 'poverka']) assert.equal(cityOfBranch(v), 'taraz', String(v));
});

test('cityOfCoords: город по метке (чтобы чип встал на нужный)', () => {
  assert.equal(cityOfCoords(51.148, 71.429), 'astana');
  assert.equal(cityOfCoords(42.899, 71.372), 'taraz');
  assert.equal(cityOfCoords(43.238, 76.889), 'almaty');
  assert.equal(cityOfCoords(null, null), null);
});

// ── Адрес «до подъезда» ──────────────────────────────────────
test('splitAddress: хвосты уходят в свои поля, а не дублируются', () => {
  assert.deepEqual(splitAddress('Астана, ул. Кенесары 42, подъезд 3, этаж 5, кв. 51'),
    { base: 'Астана, ул. Кенесары 42', entrance: '3', floor: '5', flat: '51' });
  assert.deepEqual(splitAddress('Тараз, Толе би 1, кв. 7'),
    { base: 'Тараз, Толе би 1', entrance: '', floor: '', flat: '7' });
  assert.deepEqual(splitAddress('Алматы, Абая 10'),
    { base: 'Алматы, Абая 10', entrance: '', floor: '', flat: '' });
  assert.deepEqual(splitAddress(''), { base: '', entrance: '', floor: '', flat: '' });
});

test('splitAddress: улица «Квартальная» — не квартира', () => {
  const p = splitAddress('Тараз, Квартальная 5');
  assert.equal(p.flat, '', 'улица не должна стать квартирой');
  assert.equal(p.base, 'Тараз, Квартальная 5');
  // «кв-л» (квартал) тоже не должен попасть в квартиру.
  assert.equal(splitAddress('Астана, кв-л 12').flat, '');
});

test('joinAddress: порядок хвостов и пропуск пустых', () => {
  assert.equal(joinAddress({ base: 'Астана, Кенесары 42', entrance: '3', floor: '', flat: '51' }),
    'Астана, Кенесары 42, подъезд 3, кв. 51');
  assert.equal(joinAddress({ base: 'Астана, Кенесары 42', entrance: '', floor: '', flat: '' }),
    'Астана, Кенесары 42');
});

test('split → join: адрес возвращается без искажений', () => {
  for (const a of [
    'Астана, ул. Кенесары 42, подъезд 3, этаж 5, кв. 51',
    'Тараз, Толе би 1, кв. 7',
    'Алматы, Абая 10',
  ]) assert.equal(joinAddress(splitAddress(a)), a, a);
});

// ── Ссылки ───────────────────────────────────────────────────
test('ссылки: есть метка — идём по метке, нет — поиском', () => {
  // 2ГИС хочет ДОЛГОТУ первой.
  assert.equal(gisViewUrl('Кенесары 42', 51.148, 71.429), 'https://2gis.kz/geo/71.429,51.148');
  assert.ok(gisViewUrl('Кенесары 42', null, null).startsWith('https://2gis.kz/search/'));
  assert.ok(gisRouteUrl('x', 51.148, 71.429).includes('/directions/points/%7C71.429,51.148'));
  // Яндекс: ll — долгота,широта; rtext — ШИРОТА,долгота. Разный порядок.
  assert.ok(yandexViewUrl('x', 51.148, 71.429).includes('ll=71.429,51.148'));
  assert.ok(yandexRouteUrl('x', 51.148, 71.429).includes('rtext=~51.148,71.429'));
});

test('ссылки: казахстанские домены (на .ru — редирект)', () => {
  for (const u of [gisViewUrl('a'), gisRouteUrl('a'), yandexViewUrl('a'), yandexRouteUrl('a')]) {
    assert.ok(/2gis\.kz|yandex\.kz/.test(u), u);
  }
});

test('ссылки: адрес экранируется (пробелы и кириллица в URL)', () => {
  const u = gisViewUrl('Тараз, Толе би 1');
  assert.ok(!/\s/.test(u), 'пробелов в ссылке быть не должно');
  assert.ok(u.includes('%'), 'кириллица должна быть закодирована');
});

test('tidyAddress: страна срезается, адрес остаётся читаемым', () => {
  assert.equal(tidyAddress('Казахстан, Астана, улица Кенесары, 42'), 'Астана, улица Кенесары, 42');
  assert.equal(tidyAddress('Қазақстан, Тараз, Толе би, 1'), 'Тараз, Толе би, 1');
  // Внутри строки «Казахстан» не трогаем — только в самом начале.
  assert.equal(tidyAddress('Алматы, Абая 10'), 'Алматы, Абая 10');
  assert.equal(tidyAddress('  Тараз ,  Толе би ,1 '), 'Тараз, Толе би, 1');
  assert.equal(tidyAddress(null), '');
});
