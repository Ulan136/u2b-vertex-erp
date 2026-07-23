import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDate, formatTime, formatDateTime } from './format';

test('formatDate: ISO-строка → ДД.ММ.ГГГГ (без сдвига TZ)', () => {
  assert.equal(formatDate('2026-07-23'), '23.07.2026');
  assert.equal(formatDate('2026-07-23T14:35:00Z'), '23.07.2026');   // режем как текст
  assert.equal(formatDate('2026-01-05'), '05.01.2026');
});

test('formatDate: пусто/невалид → пустая строка', () => {
  assert.equal(formatDate(null), '');
  assert.equal(formatDate(''), '');
  assert.equal(formatDate(undefined), '');
  assert.equal(formatDate('мусор'), '');
});

test('formatDate: Date → по локальным частям', () => {
  const d = new Date(2026, 6, 23);   // 23 июля 2026 (локально)
  assert.equal(formatDate(d), '23.07.2026');
});

test('formatTime: ЧЧ:ММ', () => {
  const d = new Date(2026, 6, 23, 14, 5);
  assert.equal(formatTime(d), '14:05');
  assert.equal(formatTime(null), '');
});

test('formatDateTime: ДД.ММ.ГГГГ ЧЧ:ММ', () => {
  const d = new Date(2026, 6, 23, 14, 35);
  assert.equal(formatDateTime(d), '23.07.2026 14:35');
  assert.equal(formatDateTime(null), '');
});

test('никогда не отдаёт ISO ГГГГ-ММ-ДД или US-формат', () => {
  const out = [formatDate('2026-07-23'), formatDateTime(new Date(2026, 6, 23, 9, 0))];
  for (const s of out) {
    assert.ok(!/\d{4}-\d{2}-\d{2}/.test(s), 'нет ISO');       // не ГГГГ-ММ-ДД
    assert.ok(!/\d{1,2}\/\d{1,2}\/\d{4}/.test(s), 'нет US');   // не ММ/ДД/ГГГГ
  }
});
