import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextSaleNo } from './sales.dto';

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
