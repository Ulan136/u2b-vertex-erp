import { test } from 'node:test';
import assert from 'node:assert/strict';
import { branchApiAllowed, branchFinanceSection } from './branchScope';

test('branchFinanceSection: Астана → branch, Алматы → branch_almaty, головной → null', () => {
  assert.equal(branchFinanceSection({ name: 'Астана', city: 'Астана' }), 'branch');
  assert.equal(branchFinanceSection({ name: 'Алматы', city: 'Алматы' }), 'branch_almaty');
  assert.equal(branchFinanceSection({ name: 'Тараз', city: 'Тараз' }), null);
  assert.equal(branchFinanceSection(null), null);
});

test('branchApiAllowed: свои эндпоинты открыты', () => {
  assert.equal(branchApiAllowed('/api/v2/orders'), true);
  assert.equal(branchApiAllowed('/api/v2/certs'), true);
  assert.equal(branchApiAllowed('/api/v2/branch/finance'), true);
});

// Филиал печатал реестр в PDF (рисуется в браузере), а Excel и Word падали с 403:
// генераторы выгрузки не были в белом списке. Данных они не достают — печатают
// строки, которые клиент уже получил отскопленными по филиалу.
test('branchApiAllowed: выгрузка Excel и Word доступна филиалу', () => {
  assert.equal(branchApiAllowed('/api/v2/xlsx'), true);
  assert.equal(branchApiAllowed('/api/v2/docx'), true);
});

test('branchApiAllowed: поддержка доступна филиалу (иначе раздел не открыть)', () => {
  assert.equal(branchApiAllowed('/api/v2/support'), true);
  assert.equal(branchApiAllowed('/api/v2/support/abc-123'), true);
  assert.equal(branchApiAllowed('/api/v2/support/abc-123/reply'), true);
});

test('branchApiAllowed: «компанейское» по-прежнему закрыто', () => {
  for (const p of ['/api/v2/sales', '/api/v2/purchases', '/api/v2/expenses', '/api/v2/debts',
                   '/api/v2/reports', '/api/v2/employees', '/api/v2/users', '/api/v2/roles']) {
    assert.equal(branchApiAllowed(p), false, p + ' должен быть закрыт для филиала');
  }
});

test('branchApiAllowed: неизвестный путь закрыт по умолчанию', () => {
  assert.equal(branchApiAllowed('/api/v2/secret-thing'), false);
});
