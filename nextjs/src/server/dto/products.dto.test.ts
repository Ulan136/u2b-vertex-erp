import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sealMarker, productReorderSchema, hasDuplicates } from './products.dto';

// Клеймо-расходник списывается при создании ПОВЕРКИ (docType='cert'):
test('sealMarker: поверка СЛ → списываем лейбл (СЛ)', () => {
  assert.equal(sealMarker('cert', 'СЛ'), 'СЛ');
});
test('sealMarker: поверка ПЛ → списываем пломбо (ПЛ)', () => {
  assert.equal(sealMarker('cert', 'ПЛ'), 'ПЛ');
});
test('sealMarker: поверка без явного клейма → дефолт СЛ (как радио в форме)', () => {
  assert.equal(sealMarker('cert', null), 'СЛ');
  assert.equal(sealMarker(undefined, undefined), 'СЛ');
});
test('sealMarker: извещение клеймо НЕ тратит', () => {
  assert.equal(sealMarker('izv', 'СЛ'), null);
  assert.equal(sealMarker('izv', 'ПЛ'), null);
});

// ── Перестановка позиций склада ──────────────────────────────
test('productReorderSchema: список id проходит, мусор — нет', () => {
  const a = '11111111-1111-4111-8111-111111111111';
  const b = '22222222-2222-4222-8222-222222222222';
  assert.deepEqual(productReorderSchema.parse({ ids: [a, b] }).ids, [a, b]);
  assert.throws(() => productReorderSchema.parse({ ids: [] }));          // пустой список
  assert.throws(() => productReorderSchema.parse({ ids: ['SKU-001'] })); // не uuid
});
test('hasDuplicates: один товар дважды — сбитый порядок', () => {
  const a = '11111111-1111-4111-8111-111111111111';
  const b = '22222222-2222-4222-8222-222222222222';
  assert.equal(hasDuplicates([a, b]), false);
  assert.equal(hasDuplicates([a, b, a]), true);
});
