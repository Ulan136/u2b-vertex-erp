import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  migrateRole, isScreenAllowed, visibleScreenKeys, permissionUpsertSchema,
  startScreenKey, SCREEN_KEYS, SCREEN_LABELS, type PermRow,
} from './permissions.dto';

test('SCREEN_LABELS: подпись есть для каждого экрана матрицы «Доступы»', () => {
  for (const k of SCREEN_KEYS) assert.ok(SCREEN_LABELS[k], `нет подписи для ${k}`);
});

// ── role migration (nobody is lost) ──────────────────────────
test('migrateRole: old roles map to the new set', () => {
  assert.equal(migrateRole('warehouse'), 'master');
  assert.equal(migrateRole('buyer'), 'manager');
  assert.equal(migrateRole('field'), 'master');
});
test('migrateRole: kept roles stay the same', () => {
  assert.equal(migrateRole('admin'), 'admin');
  assert.equal(migrateRole('director'), 'director');
  assert.equal(migrateRole('accountant'), 'accountant');
  assert.equal(migrateRole('manager'), 'manager');
  assert.equal(migrateRole('master'), 'master');
});
test('migrateRole: unknown falls back to manager (not lost)', () => {
  assert.equal(migrateRole('whatever'), 'manager');
  assert.equal(migrateRole(''), 'manager');
});

// ── access rule: default-allowed + admin-always (URL/route guard) ──
test('isScreenAllowed: no record ⇒ allowed by default', () => {
  assert.equal(isScreenAllowed('manager', 'warehouse', []), true);
});
test('isScreenAllowed: explicit false denies', () => {
  const perms: PermRow[] = [{ role: 'manager', screenKey: 'warehouse', allowed: false }];
  assert.equal(isScreenAllowed('manager', 'warehouse', perms), false);
});
test('isScreenAllowed: explicit true allows', () => {
  const perms: PermRow[] = [{ role: 'manager', screenKey: 'warehouse', allowed: true }];
  assert.equal(isScreenAllowed('manager', 'warehouse', perms), true);
});
test('isScreenAllowed: admin is always allowed, even with a false record', () => {
  const perms: PermRow[] = [{ role: 'admin', screenKey: 'settings', allowed: false }];
  assert.equal(isScreenAllowed('admin', 'settings', perms), true);
});
test('isScreenAllowed: denial is scoped to the exact role + screen', () => {
  const perms: PermRow[] = [{ role: 'manager', screenKey: 'settings', allowed: false }];
  assert.equal(isScreenAllowed('manager', 'settings', perms), false);
  assert.equal(isScreenAllowed('manager', 'debts', perms), true);   // other screen
  assert.equal(isScreenAllowed('master', 'settings', perms), true); // other role
});

// ── menu filtering ───────────────────────────────────────────
test('visibleScreenKeys: admin sees every screen', () => {
  assert.deepEqual(visibleScreenKeys('admin', [{ role: 'admin', screenKey: 'settings', allowed: false }]), [...SCREEN_KEYS]);
});
test('visibleScreenKeys: a denied screen is dropped from the menu', () => {
  const perms: PermRow[] = [
    { role: 'master', screenKey: 'settings', allowed: false },
    { role: 'master', screenKey: 'debts', allowed: false },
  ];
  const vis = visibleScreenKeys('master', perms);
  assert.equal(vis.includes('settings'), false);
  assert.equal(vis.includes('debts'), false);
  assert.equal(vis.includes('warehouse'), true);
  assert.equal(vis.length, SCREEN_KEYS.length - 2);
});

// ── upsert validation ────────────────────────────────────────
test('permissionUpsertSchema: valid cell parses', () => {
  const p = permissionUpsertSchema.parse({ role: 'manager', screenKey: 'debts', allowed: false });
  assert.equal(p.allowed, false);
});
test('permissionUpsertSchema: rejects unknown role or screen', () => {
  assert.throws(() => permissionUpsertSchema.parse({ role: 'buyer', screenKey: 'debts', allowed: true }));
  assert.throws(() => permissionUpsertSchema.parse({ role: 'manager', screenKey: 'nope', allowed: true }));
});

// ── start screen per role (with matrix fallback) ─────────────
test('startScreenKey: default landing per role', () => {
  assert.equal(startScreenKey('admin', []), 'dashboard');
  assert.equal(startScreenKey('director', []), 'dashboard');
  assert.equal(startScreenKey('manager', []), 'orders_field');
  assert.equal(startScreenKey('master', []), 'orders_field');
  assert.equal(startScreenKey('accountant', []), 'sales');
});
test('startScreenKey: falls back to first allowed when the preferred is denied', () => {
  // manager denied its landing (orders_field) and everything up to warehouse
  const denied = ['dashboard', 'poverka_sami', 'poverka_vdk', 'poverka_tec', 'poverka_field',
    'poverka_primary', 'poverka_astana', 'orders_field', 'orders_tec', 'sales', 'other_ops',
    'expenses', 'accounting', 'finance', 'debts', 'tasks'];
  const perms: PermRow[] = denied.map(k => ({ role: 'manager', screenKey: k, allowed: false }));
  assert.equal(startScreenKey('manager', perms), 'warehouse');   // first still-allowed screen
});
test('startScreenKey: admin ignores denials (always full access)', () => {
  const perms: PermRow[] = [{ role: 'admin', screenKey: 'dashboard', allowed: false }];
  assert.equal(startScreenKey('admin', perms), 'dashboard');
});
