import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orderCreateSchema } from './orders.dto';
import { clientCreateSchema } from './clients.dto';
import { debtCreateSchema } from './debts.dto';

// Правило: автор (created_by) проставляется ТОЛЬКО сервером из сессии. Клиент не
// может прислать/подменить автора — zod-схемы создания не содержат поля created_by
// и молча его отбрасывают. Здесь проверяем, что подмена с клиента игнорируется.

test('orderCreateSchema: created_by от клиента отбрасывается', () => {
  const parsed = orderCreateSchema.parse({ clientName: 'Иванов', createdBy: 'HACK-ID', created_by: 'HACK-ID' }) as Record<string, unknown>;
  assert.ok(!('createdBy' in parsed), 'createdBy не должен просочиться');
  assert.ok(!('created_by' in parsed), 'created_by не должен просочиться');
});

test('clientCreateSchema: created_by от клиента отбрасывается', () => {
  const parsed = clientCreateSchema.parse({ name: 'ИП Иванов', createdBy: 'HACK-ID', created_by: 'HACK-ID' }) as Record<string, unknown>;
  assert.ok(!('createdBy' in parsed) && !('created_by' in parsed));
  assert.equal(parsed.name, 'ИП Иванов');
});

test('debtCreateSchema: created_by от клиента отбрасывается', () => {
  const parsed = debtCreateSchema.parse({ type: 'credit', counterpartyName: 'ИП Иванов', amount: 100, createdBy: 'HACK-ID', created_by: 'HACK-ID' }) as Record<string, unknown>;
  assert.ok(!('createdBy' in parsed) && !('created_by' in parsed));
});
