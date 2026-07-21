import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveMutation, actionForPath, auditListPlan, labelOfResult } from './audit.dto';

test('actionForPath: метод/суффикс → действие', () => {
  assert.equal(actionForPath('POST', '/api/v2/sales'), 'created');
  assert.equal(actionForPath('PATCH', '/api/v2/orders/abc'), 'updated');
  assert.equal(actionForPath('DELETE', '/api/v2/debts/abc'), 'deleted');
  assert.equal(actionForPath('POST', '/api/v2/sales/abc/cancel'), 'cancelled');
  assert.equal(actionForPath('POST', '/api/v2/debts/abc/payments'), 'payment');
  assert.equal(actionForPath('POST', '/api/v2/notifications/abc/read'), null); // отметка «прочитано» — не логируем
  assert.equal(actionForPath('GET', '/api/v2/sales'), null);
});

test('resolveMutation: создание продажи → строка аудита с меткой из результата', () => {
  const r = resolveMutation({ method: 'POST', path: '/api/v2/sales', result: { id: 'S1', saleNo: 'ПРД-003' } });
  assert.deepEqual(r, { action: 'created', entityType: 'sale', entityId: 'S1', entityLabel: 'ПРД-003', details: null });
});

test('resolveMutation: отмена — entityId из params, действие cancelled', () => {
  const r = resolveMutation({ method: 'POST', path: '/api/v2/sales/S9/cancel', params: { id: 'S9' }, result: { ok: true } });
  assert.equal(r?.action, 'cancelled');
  assert.equal(r?.entityType, 'sale');
  assert.equal(r?.entityId, 'S9');
});

test('resolveMutation: неаудируемый сегмент → null', () => {
  assert.equal(resolveMutation({ method: 'POST', path: '/api/v2/expense-categories', result: {} }), null);
});

test('resolveMutation: draft перекрывает (label/action/skip)', () => {
  assert.equal(resolveMutation({ method: 'PATCH', path: '/api/v2/tasks/T1', params: { id: 'T1' }, result: {}, draft: { skip: true } }), null);
  const r = resolveMutation({ method: 'PATCH', path: '/api/v2/tasks/T1', params: { id: 'T1' }, result: {}, draft: { action: 'status_changed', label: 'Задача X' } });
  assert.equal(r?.action, 'status_changed');
  assert.equal(r?.entityLabel, 'Задача X');
});

test('labelOfResult: берёт первое человекочитаемое поле', () => {
  assert.equal(labelOfResult({ id: 'x', orderNo: 'ЗАК-005' }), 'ЗАК-005');
  assert.equal(labelOfResult({ id: 'x', name: 'ТОО Улан' }), 'ТОО Улан');
  assert.equal(labelOfResult({ id: 'x' }), null);
  assert.equal(labelOfResult(null), null);
});

test('auditListPlan: «Все сотрудники» — только привилегированным', () => {
  // Админ/Директор/Бухгалтер видят всё
  for (const role of ['admin', 'director', 'accountant']) {
    assert.equal(auditListPlan(role, 'all').mineOnly, false, role + ' должен видеть все');
  }
  // Менеджер/Мастер — принудительно только свои, даже если просят all
  for (const role of ['manager', 'master']) {
    assert.equal(auditListPlan(role, 'all').mineOnly, true, role + ' — только свои');
  }
});

test('auditListPlan: mine всегда только свои', () => {
  assert.equal(auditListPlan('admin', 'mine').mineOnly, true);
  assert.equal(auditListPlan('manager', 'mine').mineOnly, true);
});

test('auditListPlan: «Входы» — только Админу, остальным denied', () => {
  assert.equal(auditListPlan('admin', 'logins').onlyLogins, true);
  assert.equal(auditListPlan('admin', 'logins').denied, false);
  assert.equal(auditListPlan('director', 'logins').denied, true);
  assert.equal(auditListPlan('manager', 'logins').denied, true);
});
