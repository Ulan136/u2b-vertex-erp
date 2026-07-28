import { test } from 'node:test';
import assert from 'node:assert/strict';
import { opIcon, opSign, opAmountColor, opName, isReversal } from './opDisplay';

test('opIcon: по типу, не по знаку суммы', () => {
  assert.equal(opIcon({ opType: 'Приход' }), '📈');
  assert.equal(opIcon({ opType: 'Расход' }), '📉');
  assert.equal(opIcon({ opType: 'Перевод' }), '🔄');
  assert.equal(opIcon({ opType: 'Расход', source: 'Долг' }), '🏦');
  assert.equal(opIcon({ opType: 'Расход', source: 'Зарплата' }), '👤');
  assert.equal(opIcon({ opType: 'Приход', name: 'Ревизия склада' }), '⚖️');
});

test('opIcon: отмена (reverses) = ↩️, даже если приход с +', () => {
  assert.equal(opIcon({ opType: 'Приход', reverses: 'x' }), '↩️');
  assert.equal(isReversal({ reverses: 'x' }), true);
});

test('opSign: приход +, расход −, перевод без знака', () => {
  assert.equal(opSign({ opType: 'Приход' }), '+');
  assert.equal(opSign({ opType: 'Расход' }), '−');
  assert.equal(opSign({ opType: 'Перевод' }), '');
});

test('opAmountColor: отмена/отменённое — серый (не зелёный)', () => {
  assert.equal(opAmountColor({ opType: 'Приход' }), '#16a34a');
  assert.equal(opAmountColor({ opType: 'Расход' }), '#dc2626');
  assert.equal(opAmountColor({ opType: 'Приход', reverses: 'x' }), '#94a3b8');
  assert.equal(opAmountColor({ opType: 'Расход', reversedAt: 'x' }), '#94a3b8');
});

test('opName: «Сторно» → «Отмена» (только показ)', () => {
  assert.equal(opName({ name: 'Сторно: Зарплата Құрман Дана' }), 'Отмена: Зарплата Құрман Дана');
  assert.equal(opName({ name: 'Расход: Аренда' }), 'Расход: Аренда');
});
