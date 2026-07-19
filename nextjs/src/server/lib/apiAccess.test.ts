import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCabinetPublicApi, apiScreenFor, isFinanceWrite, financeWriteAllowed } from './apiAccess';

const sp = (q = '') => new URLSearchParams(q);

// ── cabinet allowlist (only what the public cabinets need) ───
test('isCabinetPublicApi: order submit + cabinet url are public', () => {
  assert.equal(isCabinetPublicApi('POST', '/api/v2/orders'), true);
  assert.equal(isCabinetPublicApi('GET', '/api/v2/orders/external-url'), true);
  assert.equal(isCabinetPublicApi('OPTIONS', '/api/v2/anything'), true);
});
test('isCabinetPublicApi: everything else requires a session', () => {
  assert.equal(isCabinetPublicApi('GET', '/api/v2/orders'), false);      // list is NOT public
  assert.equal(isCabinetPublicApi('DELETE', '/api/v2/orders'), false);
  assert.equal(isCabinetPublicApi('GET', '/api/v2/debts'), false);
  assert.equal(isCabinetPublicApi('POST', '/api/v2/users'), false);
});

// ── matrix enforced at the API ───────────────────────────────
test('apiScreenFor: resource endpoints map to their screen', () => {
  assert.equal(apiScreenFor('GET', '/api/v2/debts', sp()), 'debts');
  assert.equal(apiScreenFor('POST', '/api/v2/debt-payments', sp()), 'debts');
  assert.equal(apiScreenFor('PATCH', '/api/v2/tasks/abc', sp()), 'tasks');
  assert.equal(apiScreenFor('GET', '/api/v2/clients', sp()), 'clients');
  assert.equal(apiScreenFor('GET', '/api/v2/client-categories', sp()), 'clients');
  assert.equal(apiScreenFor('GET', '/api/v2/sales', sp()), 'sales');
  assert.equal(apiScreenFor('POST', '/api/v2/products', sp()), 'warehouse');
  assert.equal(apiScreenFor('POST', '/api/v2/role-permissions', sp()), 'settings');
  assert.equal(apiScreenFor('GET', '/api/v2/employees', sp()), 'staff');
  assert.equal(apiScreenFor('POST', '/api/v2/employees', sp()), 'staff');
  assert.equal(apiScreenFor('GET', '/api/v2/employees/candidates', sp()), 'staff');
  assert.equal(apiScreenFor('POST', '/api/v2/employees/abc/payments', sp()), 'staff');
  assert.equal(apiScreenFor('GET', '/api/v2/expense-categories', sp()), 'expenses');
  assert.equal(apiScreenFor('POST', '/api/v2/expense-categories', sp()), 'expenses');
  assert.equal(apiScreenFor('DELETE', '/api/v2/expense-categories/abc', sp()), 'expenses');
  assert.equal(apiScreenFor('GET', '/api/v2/documents', sp()), 'accounting');
  assert.equal(apiScreenFor('POST', '/api/v2/documents', sp()), 'accounting');
  assert.equal(apiScreenFor('GET', '/api/v2/org', sp()), null);          // реквизиты читают все
  assert.equal(apiScreenFor('PATCH', '/api/v2/org', sp()), 'settings');  // правка — Настройки
  assert.equal(apiScreenFor('GET', '/api/v2/orders', sp()), 'orders_field'); // не спутать org с orders
});
test('apiScreenFor: users picker vs management', () => {
  assert.equal(apiScreenFor('GET', '/api/v2/users', sp()), null);              // пикер исполнителей — любой вошедший
  assert.equal(apiScreenFor('GET', '/api/v2/users', sp('all=1')), 'settings'); // полный список
  assert.equal(apiScreenFor('POST', '/api/v2/users', sp()), 'settings');       // создание
  assert.equal(apiScreenFor('PATCH', '/api/v2/users/abc', sp()), 'settings');  // правка
});
test('apiScreenFor: orders list maps by source', () => {
  assert.equal(apiScreenFor('GET', '/api/v2/orders', sp('source=field_check')), 'orders_field');
  assert.equal(apiScreenFor('GET', '/api/v2/orders', sp('source=tec')), 'orders_tec');
  assert.equal(apiScreenFor('GET', '/api/v2/orders', sp()), 'orders_field');
});
test('apiScreenFor: certs list maps by direction (source)', () => {
  assert.equal(apiScreenFor('GET', '/api/v2/certs', sp('source=ВДК')), 'poverka_vdk');
  assert.equal(apiScreenFor('GET', '/api/v2/certs', sp('source=ТЭЦ')), 'poverka_tec');
  assert.equal(apiScreenFor('GET', '/api/v2/certs', sp('source=Астана')), 'poverka_astana');
  assert.equal(apiScreenFor('GET', '/api/v2/certs', sp()), null); // no source → session-only
});
test('apiScreenFor: multi-purpose endpoints are session-only (no screen)', () => {
  assert.equal(apiScreenFor('GET', '/api/v2/finance', sp()), null);
  assert.equal(apiScreenFor('GET', '/api/v2/me', sp()), null);
  assert.equal(apiScreenFor('PATCH', '/api/v2/orders/abc', sp()), null);
  assert.equal(apiScreenFor('PATCH', '/api/v2/certs/abc', sp()), null); // cert edit → session-only
});

// ── финансы: чтение всем, запись только admin/accountant ─────
test('isFinanceWrite: только мутации финансов', () => {
  assert.equal(isFinanceWrite('GET', '/api/v2/finance'), false);
  assert.equal(isFinanceWrite('POST', '/api/v2/finance'), true);
  assert.equal(isFinanceWrite('POST', '/api/v2/finance/accounts'), true);
  assert.equal(isFinanceWrite('PATCH', '/api/v2/finance/accounts/abc'), true);
  assert.equal(isFinanceWrite('GET', '/api/v2/debts'), false);
});
test('financeWriteAllowed: директор — только чтение; админ/бухгалтер — полный', () => {
  // GET разрешён всем
  assert.equal(financeWriteAllowed('GET', '/api/v2/finance', 'director'), true);
  // запись
  assert.equal(financeWriteAllowed('POST', '/api/v2/finance', 'admin'), true);
  assert.equal(financeWriteAllowed('POST', '/api/v2/finance', 'accountant'), true);
  assert.equal(financeWriteAllowed('POST', '/api/v2/finance', 'director'), false);
  assert.equal(financeWriteAllowed('POST', '/api/v2/finance', 'manager'), false);
  assert.equal(financeWriteAllowed('PATCH', '/api/v2/finance/accounts/x', 'director'), false);
  // не финансовые записи не ограничиваем этим правилом
  assert.equal(financeWriteAllowed('POST', '/api/v2/tasks', 'director'), true);
});
