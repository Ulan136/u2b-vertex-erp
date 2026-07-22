import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normDisplay, normKey, sameDeviceType, resolveDeviceType, touchAction, deviceTypeMoveNames } from './deviceTypes.dto';

test('normDisplay: трим + схлопывание пробелов, регистр/скрипт сохраняются', () => {
  assert.equal(normDisplay('  СГВ   15 '), 'СГВ 15');
  assert.equal(normDisplay('СВК-15'), 'СВК-15');
  assert.equal(normDisplay(null), '');
});

test('normKey: кириллическая К/В/С = латинская K/B/C, регистр не важен', () => {
  assert.equal(normKey('СВК-15'), 'cbk-15');
  assert.equal(normKey('свк-15'), 'cbk-15');
  assert.equal(normKey('CBK-15'), 'cbk-15');   // латиница
  assert.equal(normKey('СВК-15'), normKey('CBK-15'));
});

test('sameDeviceType: разные написания одного типа совпадают', () => {
  assert.ok(sameDeviceType('свк-15', 'СВК-15'));
  assert.ok(sameDeviceType('CBK-15', 'СВК-15'));
  assert.ok(!sameDeviceType('СГВ-15', 'СВК-15'));
  assert.ok(!sameDeviceType('', ''));   // пустое не совпадает
});

const TYPES = [
  { id: 't1', norm: normKey('СГВ-15') },
  { id: 't2', norm: normKey('СВК-15') },
];
const ALIASES = [
  { norm: normKey('Декаст'), deviceTypeId: 't3' },   // алиас «Декаст» → Декаст ВСКМ90-32
];

test('resolveDeviceType: алиас имеет приоритет, потом имя; разные написания совпадают', () => {
  assert.equal(resolveDeviceType('СВК-15', TYPES, ALIASES), 't2');
  assert.equal(resolveDeviceType('свк-15', TYPES, ALIASES), 't2');
  assert.equal(resolveDeviceType('CBK-15', TYPES, ALIASES), 't2');   // латиница
  assert.equal(resolveDeviceType('Декаст', TYPES, ALIASES), 't3');   // по алиасу
  assert.equal(resolveDeviceType('СВК-99', TYPES, ALIASES), null);   // нет совпадения
});

test('touchAction (инкремент): совпало → bump; новое → create; пусто → null', () => {
  assert.deepEqual(touchAction('свк-15', TYPES, ALIASES), { action: 'bump', id: 't2' });
  assert.deepEqual(touchAction('Декаст', TYPES, ALIASES), { action: 'bump', id: 't3' });
  assert.deepEqual(touchAction('  Новый  Тип ', TYPES, ALIASES), { action: 'create', name: 'Новый Тип' });
  assert.equal(touchAction('   ', TYPES, ALIASES), null);
});

test('deviceTypeMoveNames (merge): переносим все написания приёмника, без дублей', () => {
  const fromNorms = ['cbk-15'];                          // норм исходного типа СВК-15
  const meters = ['СВК-15', 'свк-15', 'CBK-15', 'СГВ-15', null, ''];
  const moved = deviceTypeMoveNames(fromNorms, meters);
  assert.deepEqual(moved.sort(), ['CBK-15', 'СВК-15', 'свк-15'].sort());   // три написания, СГВ-15 не трогаем
});
