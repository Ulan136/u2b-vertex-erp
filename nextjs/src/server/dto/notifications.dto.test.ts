import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  orderRecipients, taskAssignedRecipients, taskDoneRecipients, commentRecipients, idsToPrune,
} from './notifications.dto';
import { isOnline } from './presence.dto';
import { commentCreateSchema } from './comments.dto';

const U = (id: string, role: string, isActive = true) => ({ id, role, isActive });

// ── новый заказ → менеджеры + админы (активные) ──────────────
test('orderRecipients: only active managers + admins', () => {
  const users = [
    U('a', 'admin'), U('m1', 'manager'), U('m2', 'manager'),
    U('d', 'director'), U('acc', 'accountant'), U('ms', 'master'),
    U('m3', 'manager', false),   // inactive — excluded
  ];
  assert.deepEqual(orderRecipients(users).sort(), ['a', 'm1', 'm2']);
});

// ── назначена задача → исполнителю (не себе) ─────────────────
test('taskAssignedRecipients: assignee, unless self or none', () => {
  assert.deepEqual(taskAssignedRecipients('u2', 'u1'), ['u2']);
  assert.deepEqual(taskAssignedRecipients('u1', 'u1'), []);   // assigned to self
  assert.deepEqual(taskAssignedRecipients(null, 'u1'), []);   // unassigned
});

// ── задача «Готова» → создателю (не себе) ────────────────────
test('taskDoneRecipients: creator, unless self or none', () => {
  assert.deepEqual(taskDoneRecipients('creator', 'someone'), ['creator']);
  assert.deepEqual(taskDoneRecipients('creator', 'creator'), []);  // closed it themselves
  assert.deepEqual(taskDoneRecipients(null, 'x'), []);
});

// ── новый комментарий → участники минус автор ────────────────
test('commentRecipients: task participants minus the comment author, unique', () => {
  const r = commentRecipients({ creatorId: 'creator', assigneeId: 'assignee', commenterIds: ['creator', 'other', 'author'], authorId: 'author' });
  assert.deepEqual(r.sort(), ['assignee', 'creator', 'other']);
});
test('commentRecipients: order case (no creator/assignee) = prior commenters minus author', () => {
  const r = commentRecipients({ commenterIds: ['x', 'y', 'author'], authorId: 'author' });
  assert.deepEqual(r.sort(), ['x', 'y']);
});
test('commentRecipients: author who is the only participant → nobody', () => {
  assert.deepEqual(commentRecipients({ creatorId: 'author', commenterIds: ['author'], authorId: 'author' }), []);
});

// ── хранить не более 100 ─────────────────────────────────────
test('idsToPrune: keep newest 100, delete the rest', () => {
  const ids = Array.from({ length: 130 }, (_, i) => 'n' + i);   // newest-first
  const del = idsToPrune(ids, 100);
  assert.equal(del.length, 30);
  assert.equal(del[0], 'n100');
  assert.equal(idsToPrune(ids.slice(0, 50), 100).length, 0);   // under the cap → nothing
});

// ── онлайн = last_seen_at не старше 3 минут ──────────────────
test('isOnline: within 3 min online, older offline, null offline', () => {
  const now = Date.parse('2026-07-16T12:00:00Z');
  assert.equal(isOnline('2026-07-16T11:58:30Z', now), true);   // 1.5 min ago
  assert.equal(isOnline('2026-07-16T11:56:30Z', now), false);  // 3.5 min ago
  assert.equal(isOnline(null, now), false);
  assert.equal(isOnline(undefined, now), false);
});

// ── валидация комментария ────────────────────────────────────
test('commentCreateSchema: valid comment parses; empty/bad rejected', () => {
  const c = commentCreateSchema.parse({ entityType: 'task', entityId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', text: 'привет' });
  assert.equal(c.text, 'привет');
  assert.throws(() => commentCreateSchema.parse({ entityType: 'task', entityId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', text: '   ' }));
  assert.throws(() => commentCreateSchema.parse({ entityType: 'nope', entityId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', text: 'x' }));
});
