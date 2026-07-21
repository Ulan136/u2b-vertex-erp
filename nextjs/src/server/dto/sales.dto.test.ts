import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextSaleNo, normalizeItems, aggregateItems } from './sales.dto';

test('nextSaleNo: пустой журнал → ПРД-001', () => {
  assert.equal(nextSaleNo([]), 'ПРД-001');
});
test('nextSaleNo: продолжает с максимального', () => {
  assert.equal(nextSaleNo(['ПРД-001', 'ПРД-004', 'ПРД-002']), 'ПРД-005');
  assert.equal(nextSaleNo(['ПРД-009']), 'ПРД-010');
});
test('nextSaleNo: мусор игнорируется', () => {
  assert.equal(nextSaleNo([null, undefined, '', 'abc']), 'ПРД-001');
});

test('normalizeItems: считает сумму и отбрасывает пустые позиции', () => {
  const items = normalizeItems({ items: [
    { productId: 'A', qty: 2, price: 1000 },
    { productId: '', qty: 5, price: 10 },   // без товара — отброшена
    { productId: 'B', qty: 0, price: 50 },  // qty 0 — отброшена
  ] });
  assert.equal(items.length, 1);
  assert.deepEqual(items[0], { productId: 'A', productName: null, skuCode: null, qty: 2, price: 1000, sum: 2000 });
});

test('normalizeItems: одиночный товар (back-compat) синтезируется в позицию', () => {
  const items = normalizeItems({ productId: 'X', qty: 3, price: 500 });
  assert.equal(items.length, 1);
  assert.equal(items[0].sum, 1500);
});

test('aggregateItems: одна позиция → productId проставлен', () => {
  const a = aggregateItems([{ productId: 'A', productName: 'Счётчик', skuCode: 'SKU-1', qty: 2, price: 1000, sum: 2000 }]);
  assert.equal(a.qty, 2); assert.equal(a.total, 2000); assert.equal(a.productId, 'A'); assert.equal(a.productName, 'Счётчик');
});

test('aggregateItems: несколько позиций → «+N поз.», productId=null, сумма/кол-во по всем', () => {
  const a = aggregateItems([
    { productId: 'A', productName: 'Счётчик', skuCode: 'SKU-1', qty: 2, price: 1000, sum: 2000 },
    { productId: 'B', productName: 'Пломба', skuCode: 'SKU-2', qty: 5, price: 100, sum: 500 },
  ]);
  assert.equal(a.qty, 7); assert.equal(a.total, 2500); assert.equal(a.productId, null);
  assert.match(a.productName || '', /\+1 поз\./);
});
