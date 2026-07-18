import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  orderCreateSchema, nextOrderNoFor, filterOrdersBySource, externalCabinetUrl,
  orderInBranch, scopeOrdersByBranch,
} from './orders.dto';

const HEAD = 'head-almaty', AST = 'astana';
const O = (branchId: string | null) => ({ id: branchId || 'null', branchId });
const rows = [O(HEAD), O(AST), O(null)];   // Алматы, Астана, без филиала (=Алматы)

// ── заявка без филиала = головной (Алматы) ───────────────────
test('orderInBranch: NULL филиал считается головным', () => {
  assert.equal(orderInBranch({ branchId: null }, HEAD, HEAD), true);
  assert.equal(orderInBranch({ branchId: null }, AST, HEAD), false);
  assert.equal(orderInBranch({ branchId: AST }, AST, HEAD), true);
});

// ── админ/директор видят все филиалы ─────────────────────────
test('scopeOrdersByBranch: admin и director видят всё', () => {
  assert.equal(scopeOrdersByBranch(rows, { role: 'admin', headBranchId: HEAD }).length, 3);
  assert.equal(scopeOrdersByBranch(rows, { role: 'director', headBranchId: HEAD }).length, 3);
});

test('scopeOrdersByBranch: админ может отфильтровать по филиалу', () => {
  const ast = scopeOrdersByBranch(rows, { role: 'admin', headBranchId: HEAD, branchFilter: AST });
  assert.deepEqual(ast.map(o => o.branchId), [AST]);
  const alm = scopeOrdersByBranch(rows, { role: 'admin', headBranchId: HEAD, branchFilter: HEAD });
  assert.deepEqual(alm.map(o => o.branchId).sort(), [HEAD, null].sort());  // включая заявки без филиала
});

// ── остальные — только свой филиал ───────────────────────────
test('scopeOrdersByBranch: менеджер Астаны видит только Астану', () => {
  const r = scopeOrdersByBranch(rows, { role: 'manager', userBranchId: AST, headBranchId: HEAD });
  assert.deepEqual(r.map(o => o.branchId), [AST]);
});

test('scopeOrdersByBranch: сотрудник головного видит Алматы + заявки без филиала', () => {
  const r = scopeOrdersByBranch(rows, { role: 'master', userBranchId: HEAD, headBranchId: HEAD });
  assert.deepEqual(r.map(o => o.branchId).sort(), [HEAD, null].sort());
});

test('scopeOrdersByBranch: без филиала у пользователя → видит всё (правило мастера)', () => {
  const r = scopeOrdersByBranch(rows, { role: 'master', userBranchId: null, headBranchId: HEAD });
  assert.equal(r.length, 3);
});

// ── source assignment (cabinet тэц → source=tec) ─────────────
test('orderCreateSchema: тэц cabinet payload keeps source=tec', () => {
  const parsed = orderCreateSchema.parse({ source: 'tec', phone: '+7 700 000 00 00', positions: [] });
  assert.equal(parsed.source, 'tec');
});

test('orderCreateSchema: default source is field_check (old cabinet unchanged)', () => {
  const parsed = orderCreateSchema.parse({ phone: '+7 700 000 00 00', positions: [] });
  assert.equal(parsed.source, 'field_check');
});

test('orderCreateSchema: invalid source is rejected', () => {
  assert.throws(() => orderCreateSchema.parse({ source: 'other', positions: [] }));
});

// ── ТЭЦ screen must not show foreign orders ──────────────────
test('filterOrdersBySource: keeps only tec orders', () => {
  const rows = [
    { id: '1', source: 'tec' },
    { id: '2', source: 'field_check' },
    { id: '3', source: 'tec' },
  ];
  assert.deepEqual(filterOrdersBySource(rows, 'tec').map(r => r.id), ['1', '3']);
});

test('filterOrdersBySource: field_check excludes tec orders', () => {
  const rows = [
    { id: '1', source: 'tec' },
    { id: '2', source: 'field_check' },
  ];
  assert.deepEqual(filterOrdersBySource(rows, 'field_check').map(r => r.id), ['2']);
});

test('filterOrdersBySource: rows without source count as field_check', () => {
  const rows = [{ id: '1' }, { id: '2', source: 'tec' }];
  assert.deepEqual(filterOrdersBySource(rows, 'field_check').map(r => r.id), ['1']);
  assert.deepEqual(filterOrdersBySource(rows, 'tec').map(r => r.id), ['2']);
});

// ── separate numbering (ЗАК-*** vs ТЭЦ-***) ──────────────────
test('nextOrderNoFor: tec numbering ignores ЗАК numbers', () => {
  const existing = ['ЗАК-001', 'ЗАК-002', 'ТЭЦ-001', 'ЗАК-003'];
  assert.equal(nextOrderNoFor('tec', existing), 'ТЭЦ-002');
});

test('nextOrderNoFor: field_check numbering ignores ТЭЦ numbers', () => {
  const existing = ['ЗАК-005', 'ТЭЦ-009', 'ТЭЦ-010'];
  assert.equal(nextOrderNoFor('field_check', existing), 'ЗАК-006');
});

test('nextOrderNoFor: first number of an empty source is 001', () => {
  assert.equal(nextOrderNoFor('tec', ['ЗАК-001', 'ЗАК-002']), 'ТЭЦ-001');
  assert.equal(nextOrderNoFor('field_check', []), 'ЗАК-001');
});

test('nextOrderNoFor: streams stay independent given a mixed history', () => {
  const existing = ['ЗАК-001', 'ТЭЦ-001', 'ЗАК-002', 'ТЭЦ-002', 'ТЭЦ-003'];
  assert.equal(nextOrderNoFor('field_check', existing), 'ЗАК-003');
  assert.equal(nextOrderNoFor('tec', existing), 'ТЭЦ-004');
});

// ── external cabinet URL per source ──────────────────────────
test('externalCabinetUrl: tec lives under /tec, field_check stays at base', () => {
  assert.equal(externalCabinetUrl('https://u2b-vertex-erp.vercel.app/cabinet', 'field_check'), 'https://u2b-vertex-erp.vercel.app/cabinet');
  assert.equal(externalCabinetUrl('https://u2b-vertex-erp.vercel.app/cabinet', 'tec'), 'https://u2b-vertex-erp.vercel.app/cabinet/tec');
  assert.equal(externalCabinetUrl('https://u2b-vertex-erp.vercel.app/cabinet/', 'tec'), 'https://u2b-vertex-erp.vercel.app/cabinet/tec');
});
