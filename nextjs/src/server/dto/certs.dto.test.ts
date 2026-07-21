import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanCertFields } from './certs.dto';

test('cleanCertFields: undefined убирается (→ дефолт БД), не ломает вставку', () => {
  const out = cleanCertFields({ source: 'САМИ', fio: 'Иванов', checkDate: undefined, branchId: undefined, meterType: undefined });
  assert.deepEqual(out, { source: 'САМИ', fio: 'Иванов' });
  assert.ok(!('checkDate' in out) && !('branchId' in out));
});

test('cleanCertFields: пустая строка в date/uuid → null (иначе 500)', () => {
  const out = cleanCertFields({ checkDate: '', nextCheckDate: '', branchId: '', fio: '' });
  assert.equal(out.checkDate, null);
  assert.equal(out.nextCheckDate, null);
  assert.equal(out.branchId, null);
  assert.equal(out.fio, '');   // обычный текст пустую строку сохраняет
});

test('cleanCertFields: null и обычные значения проходят как есть', () => {
  const out = cleanCertFields({ checkDate: '2026-07-22', meterType: null, operStatus: 'В работе' });
  assert.equal(out.checkDate, '2026-07-22');
  assert.equal(out.meterType, null);
  assert.equal(out.operStatus, 'В работе');
});
