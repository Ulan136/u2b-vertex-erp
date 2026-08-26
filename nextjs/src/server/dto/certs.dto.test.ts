import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanCertFields, isCertPaid, sectionForCertSource, certIncomePosts, certUpsertSchema } from './certs.dto';
import { sealMarker } from './products.dto';

test('sectionForCertSource: Астана → branch, прочие → poverka', () => {
  assert.equal(sectionForCertSource('Астана'), 'branch');
  assert.equal(sectionForCertSource('САМИ'), 'poverka');
  assert.equal(sectionForCertSource('Выездная'), 'poverka');
});
test('certIncomePosts: доход только оплачено + не Выездная + цена>0', () => {
  assert.equal(certIncomePosts({ source: 'САМИ', payStatus: 'Оплачено', amount: 10000 }), true);
  assert.equal(certIncomePosts({ source: 'Выездная', payStatus: 'Оплачено', amount: 10000 }), false); // Выездная — доход через заявку
  assert.equal(certIncomePosts({ source: 'САМИ', payStatus: 'В ожидании', amount: 10000 }), false);
  assert.equal(certIncomePosts({ source: 'САМИ', payStatus: 'Бесплатно', amount: 10000 }), false);
  assert.equal(certIncomePosts({ source: 'САМИ', payStatus: 'Оплачено', amount: 0 }), false);      // без цены — не проводим
});

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

// ── списание клейма только у ОПЛАЧЕННОЙ поверки ──────────────
test('isCertPaid: только «Оплачено» — расход', () => {
  assert.equal(isCertPaid('Оплачено'), true);
  assert.equal(isCertPaid('В ожидании'), false);
  assert.equal(isCertPaid(null), false);
  assert.equal(isCertPaid(undefined), false);
});

// итоговый маркер = (оплачено ? клеймо : ничего) — как certs.service.sealFor
const sealFor = (c: { docType?: string | null; sealType?: string | null; payStatus?: string | null }) =>
  isCertPaid(c.payStatus) ? sealMarker(c.docType, c.sealType) : null;

test('sealFor: оплаченная поверка СЛ → списываем СЛ, ПЛ → ПЛ', () => {
  assert.equal(sealFor({ docType: 'cert', sealType: 'СЛ', payStatus: 'Оплачено' }), 'СЛ');
  assert.equal(sealFor({ docType: 'cert', sealType: 'ПЛ', payStatus: 'Оплачено' }), 'ПЛ');
});
test('sealFor: поверка «В ожидании» → НЕ списываем', () => {
  assert.equal(sealFor({ docType: 'cert', sealType: 'СЛ', payStatus: 'В ожидании' }), null);
});
test('sealFor: оплаченное извещение → НЕ списываем (не поверка)', () => {
  assert.equal(sealFor({ docType: 'izv', sealType: 'СЛ', payStatus: 'Оплачено' }), null);
});

// ── Реквизиты для е-КТРМ ──────────────────────────────────────
test('certUpsertSchema: ИИН/БИН — ровно 12 цифр либо пусто', () => {
  assert.equal(certUpsertSchema.safeParse({ ownerTaxId: '901231300123' }).success, true);
  assert.equal(certUpsertSchema.safeParse({ ownerTaxId: '' }).success, true);          // в е-КТРМ поле часто пустое
  assert.equal(certUpsertSchema.safeParse({ ownerTaxId: '12345' }).success, false);
  assert.equal(certUpsertSchema.safeParse({ ownerTaxId: '90123130012a' }).success, false);
});
test('certUpsertSchema: владелец — только физлицо или юрлицо', () => {
  assert.equal(certUpsertSchema.safeParse({ ownerKind: 'физлицо' }).success, true);
  assert.equal(certUpsertSchema.safeParse({ ownerKind: 'юрлицо' }).success, true);
  assert.equal(certUpsertSchema.safeParse({ ownerKind: 'ИП' }).success, false);
});
test('certUpsertSchema: поверитель, класс точности и казахский адрес принимаются', () => {
  const r = certUpsertSchema.safeParse({ verifier: 'Болегенов А.', accuracyClass: '±5; ±2', addressKz: 'Тараз қ.' });
  assert.equal(r.success, true);
});
