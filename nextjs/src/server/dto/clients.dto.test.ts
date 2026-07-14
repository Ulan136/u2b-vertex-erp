import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone, assertCategoryInBranch } from './clients.dto';
import { ApiError } from '@/server/lib/errors';

// ── normalizePhone → +7XXXXXXXXXX ────────────────────────────
test('normalizePhone: bare 10-digit number gets +7 prefix', () => {
  assert.equal(normalizePhone('7000000000'), '+77000000000');
});

test('normalizePhone: 11-digit starting with 7 is kept', () => {
  assert.equal(normalizePhone('77001234567'), '+77001234567');
});

test('normalizePhone: leading 8 (trunk prefix) becomes +7', () => {
  assert.equal(normalizePhone('87001234567'), '+77001234567');
});

test('normalizePhone: strips spaces, parens and dashes', () => {
  assert.equal(normalizePhone('+7 (700) 123-45-67'), '+77001234567');
  assert.equal(normalizePhone('8 700 123 45 67'), '+77001234567');
});

test('normalizePhone: empty / null / undefined → null', () => {
  assert.equal(normalizePhone(''), null);
  assert.equal(normalizePhone('   '), null);
  assert.equal(normalizePhone(null), null);
  assert.equal(normalizePhone(undefined), null);
});

test('normalizePhone: invalid length throws 400', () => {
  assert.throws(() => normalizePhone('12345'), (e: unknown) => e instanceof ApiError && e.status === 400);
  assert.throws(() => normalizePhone('700000000000000'), (e: unknown) => e instanceof ApiError && e.status === 400);
  // 11 digits not starting with 7/8 is not a valid KZ number
  assert.throws(() => normalizePhone('12345678901'), (e: unknown) => e instanceof ApiError && e.status === 400);
});

// ── assertCategoryInBranch (category must belong to client's branch) ──
const BR_A = '11111111-1111-1111-1111-111111111111';
const BR_B = '22222222-2222-2222-2222-222222222222';
const CAT  = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

test('assertCategoryInBranch: no category (null) is always allowed', () => {
  assert.doesNotThrow(() => assertCategoryInBranch(null, BR_A, null));
  assert.doesNotThrow(() => assertCategoryInBranch(undefined, BR_A, undefined));
});

test('assertCategoryInBranch: category in the same branch passes', () => {
  assert.doesNotThrow(() => assertCategoryInBranch({ id: CAT, branchId: BR_A }, BR_A, CAT));
});

test('assertCategoryInBranch: category from another branch throws 400', () => {
  assert.throws(
    () => assertCategoryInBranch({ id: CAT, branchId: BR_B }, BR_A, CAT),
    (e: unknown) => e instanceof ApiError && e.status === 400,
  );
});

test('assertCategoryInBranch: categoryId given but category not found throws 400', () => {
  assert.throws(
    () => assertCategoryInBranch(null, BR_A, CAT),
    (e: unknown) => e instanceof ApiError && e.status === 400,
  );
});
