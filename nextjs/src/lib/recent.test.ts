import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeRecent } from './recent';

test('mergeRecent: новый элемент встаёт первым', () => {
  const r = mergeRecent([{ v: 'СГВ-15' }], { v: 'СВК-15' });
  assert.deepEqual(r.map(x => x.v), ['СВК-15', 'СГВ-15']);
});

test('mergeRecent: дубль (без регистра) поднимается наверх, без повтора', () => {
  const r = mergeRecent([{ v: 'СГВ-15' }, { v: 'СВК-15' }], { v: 'свк-15' });
  assert.deepEqual(r.map(x => x.v), ['свк-15', 'СГВ-15']);
  assert.equal(r.length, 2);
});

test('mergeRecent: максимум 5', () => {
  let r: { v: string }[] = [];
  for (const v of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) r = mergeRecent(r, { v });
  assert.equal(r.length, 5);
  assert.deepEqual(r.map(x => x.v), ['g', 'f', 'e', 'd', 'c']);
});

test('mergeRecent: пустое значение не добавляется', () => {
  const r = mergeRecent([{ v: 'a' }], { v: '   ' });
  assert.deepEqual(r.map(x => x.v), ['a']);
});

test('mergeRecent: сохраняет мету (тип покупателя)', () => {
  const r = mergeRecent([], { v: 'ИП Иванов', m: 'client' });
  assert.equal(r[0].m, 'client');
});
