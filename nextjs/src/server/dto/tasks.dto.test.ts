import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  nextStatus, resolveCompletedAt, isOverdue, taskCreateSchema, taskUpdateSchema,
} from './tasks.dto';

// ── status flow: new → accepted → in_progress → done ─────────
test('nextStatus: advances through the flow', () => {
  assert.equal(nextStatus('new'), 'accepted');
  assert.equal(nextStatus('accepted'), 'in_progress');
  assert.equal(nextStatus('in_progress'), 'done');
});
test('nextStatus: done is terminal', () => {
  assert.equal(nextStatus('done'), null);
});

// ── completed_at stamping ────────────────────────────────────
test('resolveCompletedAt: moving to done stamps now', () => {
  const now = new Date('2026-07-15T10:00:00Z');
  assert.equal(resolveCompletedAt('done', null, now), now);
});
test('resolveCompletedAt: staying done keeps the original time', () => {
  const now = new Date('2026-07-15T10:00:00Z');
  const original = new Date('2026-07-01T08:00:00Z');
  assert.equal(resolveCompletedAt('done', original, now), original);
});
test('resolveCompletedAt: any non-done status clears completed_at', () => {
  const now = new Date('2026-07-15T10:00:00Z');
  const original = new Date('2026-07-01T08:00:00Z');
  assert.equal(resolveCompletedAt('new', original, now), null);
  assert.equal(resolveCompletedAt('accepted', original, now), null);
  assert.equal(resolveCompletedAt('in_progress', null, now), null);
});

// ── overdue detection ────────────────────────────────────────
test('isOverdue: past due and not done → overdue', () => {
  assert.equal(isOverdue('2026-07-10', 'in_progress', '2026-07-15'), true);
  assert.equal(isOverdue('2026-07-10', 'new', '2026-07-15'), true);
});
test('isOverdue: done tasks are never overdue', () => {
  assert.equal(isOverdue('2026-07-10', 'done', '2026-07-15'), false);
});
test('isOverdue: future or today due date is not overdue', () => {
  assert.equal(isOverdue('2026-07-20', 'new', '2026-07-15'), false);
  assert.equal(isOverdue('2026-07-15', 'new', '2026-07-15'), false);
});
test('isOverdue: no due date → not overdue', () => {
  assert.equal(isOverdue(null, 'new', '2026-07-15'), false);
  assert.equal(isOverdue(undefined, 'in_progress', '2026-07-15'), false);
});

// ── validation ───────────────────────────────────────────────
test('taskCreateSchema: title is required', () => {
  assert.throws(() => taskCreateSchema.parse({ description: 'x' }));
  assert.throws(() => taskCreateSchema.parse({ title: '   ' }));
});
test('taskCreateSchema: minimal valid task, defaults handled by service', () => {
  const t = taskCreateSchema.parse({ title: 'Позвонить клиенту' });
  assert.equal(t.title, 'Позвонить клиенту');
  assert.equal(t.status, undefined);   // service defaults to 'new'
});
test('taskCreateSchema: rejects invalid status', () => {
  assert.throws(() => taskCreateSchema.parse({ title: 'x', status: 'archived' }));
});
test('taskUpdateSchema: allows a status-only patch', () => {
  const p = taskUpdateSchema.parse({ status: 'done' });
  assert.equal(p.status, 'done');
  assert.equal(p.title, undefined);
});
