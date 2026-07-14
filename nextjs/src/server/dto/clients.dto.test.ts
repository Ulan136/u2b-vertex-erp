import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone, clientCreateSchema } from './clients.dto';
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

// ── clientCreateSchema (organization-wide, no branch) ────────
const CAT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';  // valid v4 UUID

test('clientCreateSchema: name only is valid (no branch required)', () => {
  const parsed = clientCreateSchema.parse({ name: 'ТОО Ромашка' });
  assert.equal(parsed.name, 'ТОО Ромашка');
});

test('clientCreateSchema: phone and category are optional', () => {
  const parsed = clientCreateSchema.parse({ name: 'x', phone: '+7 700 000 00 00', categoryId: CAT });
  assert.equal(parsed.categoryId, CAT);
});

test('clientCreateSchema: name is required', () => {
  assert.throws(() => clientCreateSchema.parse({ phone: '7000000000' }));
  assert.throws(() => clientCreateSchema.parse({ name: '   ' }));
});

test('clientCreateSchema: strips unknown keys like branchId', () => {
  const parsed = clientCreateSchema.parse({ name: 'x', branchId: 'whatever' }) as Record<string, unknown>;
  assert.equal('branchId' in parsed, false);
});

test('clientCreateSchema: non-uuid categoryId is rejected', () => {
  assert.throws(() => clientCreateSchema.parse({ name: 'x', categoryId: 'not-a-uuid' }));
});
