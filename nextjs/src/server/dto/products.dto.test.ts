import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sealMarker } from './products.dto';

// Клеймо-расходник списывается при создании ПОВЕРКИ (docType='cert'):
test('sealMarker: поверка СЛ → списываем лейбл (СЛ)', () => {
  assert.equal(sealMarker('cert', 'СЛ'), 'СЛ');
});
test('sealMarker: поверка ПЛ → списываем пломбо (ПЛ)', () => {
  assert.equal(sealMarker('cert', 'ПЛ'), 'ПЛ');
});
test('sealMarker: поверка без явного клейма → дефолт СЛ (как радио в форме)', () => {
  assert.equal(sealMarker('cert', null), 'СЛ');
  assert.equal(sealMarker(undefined, undefined), 'СЛ');
});
test('sealMarker: извещение клеймо НЕ тратит', () => {
  assert.equal(sealMarker('izv', 'СЛ'), null);
  assert.equal(sealMarker('izv', 'ПЛ'), null);
});
