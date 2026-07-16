import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone, assertCanDeactivate, userCreateSchema } from './users.dto';
import { ApiError } from '@/server/lib/errors';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

// ── phone normalization (same rule as clients) ───────────────
test('normalizePhone: leading 8 → +7, 10-digit gets +7', () => {
  assert.equal(normalizePhone('87001234567'), '+77001234567');
  assert.equal(normalizePhone('7001234567'), '+77001234567');
  assert.equal(normalizePhone('+7 (700) 123-45-67'), '+77001234567');
});
test('normalizePhone: empty → null, invalid → 400', () => {
  assert.equal(normalizePhone(''), null);
  assert.equal(normalizePhone(null), null);
  assert.throws(() => normalizePhone('123'), (e: unknown) => e instanceof ApiError && e.status === 400);
});

// ── last active admin cannot be deactivated ──────────────────
test('assertCanDeactivate: deactivating the last active admin is blocked', () => {
  assert.throws(
    () => assertCanDeactivate({ targetId: A, targetRole: 'admin', targetActive: true, activeAdminCount: 1 }),
    (e: unknown) => e instanceof ApiError && e.status === 400 && /последнего активного/.test(e.message),
  );
});
test('assertCanDeactivate: an admin can be deactivated when another active admin exists', () => {
  assert.doesNotThrow(
    () => assertCanDeactivate({ targetId: A, targetRole: 'admin', targetActive: true, activeAdminCount: 2 }),
  );
});
test('assertCanDeactivate: non-admin is not affected by the admin guard', () => {
  assert.doesNotThrow(
    () => assertCanDeactivate({ targetId: A, targetRole: 'manager', targetActive: true, activeAdminCount: 1 }),
  );
});

// ── cannot deactivate yourself ───────────────────────────────
test('assertCanDeactivate: deactivating yourself is blocked', () => {
  assert.throws(
    () => assertCanDeactivate({ targetId: A, targetRole: 'manager', targetActive: true, activeAdminCount: 3, actingUserId: A }),
    (e: unknown) => e instanceof ApiError && e.status === 400 && /самого себя/.test(e.message),
  );
});
test('assertCanDeactivate: deactivating a different user is allowed', () => {
  assert.doesNotThrow(
    () => assertCanDeactivate({ targetId: A, targetRole: 'manager', targetActive: true, activeAdminCount: 3, actingUserId: B }),
  );
});

// ── create validation (login fields required) ────────────────
test('userCreateSchema: requires name, email and password', () => {
  assert.throws(() => userCreateSchema.parse({ role: 'manager', email: 'a@b.kz', password: 'secret' })); // no name
  assert.throws(() => userCreateSchema.parse({ name: 'X', role: 'manager', password: 'secret' }));         // no email
  assert.throws(() => userCreateSchema.parse({ name: 'X', role: 'manager', email: 'a@b.kz', password: '1' })); // short pw
  assert.throws(() => userCreateSchema.parse({ name: 'X', role: 'buyer', email: 'a@b.kz', password: 'secret' })); // old role
});
test('userCreateSchema: a valid new user parses', () => {
  const u = userCreateSchema.parse({ name: 'Иванов И.', phone: '87001234567', position: 'Мастер', role: 'master', email: 'iv@vertex.kz', password: 'secret1' });
  assert.equal(u.role, 'master');
  assert.equal(u.email, 'iv@vertex.kz');
});
