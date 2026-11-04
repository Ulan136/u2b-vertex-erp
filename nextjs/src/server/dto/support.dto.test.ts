import { test } from 'node:test';
import assert from 'node:assert/strict';
import { supportCreateSchema, supportReplySchema, stampsForStatus, isOpenTicket } from './support.dto';

test('supportCreateSchema: тема и текст обязательны и не пустые', () => {
  assert.equal(supportCreateSchema.safeParse({ title: 'Не сохраняется серт', body: 'Жму сохранить — ошибка' }).success, true);
  assert.equal(supportCreateSchema.safeParse({ title: 'аб', body: 'Жму сохранить' }).success, false);   // тема короче 3
  assert.equal(supportCreateSchema.safeParse({ title: 'Нормальная тема', body: 'ок' }).success, false); // текст короче 5
});
test('supportCreateSchema: важность — только из списка', () => {
  assert.equal(supportCreateSchema.safeParse({ title: 'Тема раз', body: 'Описание', severity: 'Срочная' }).success, true);
  assert.equal(supportCreateSchema.safeParse({ title: 'Тема раз', body: 'Описание', severity: 'Когда-нибудь' }).success, false);
});
test('supportReplySchema: пустой ответ не принимаем', () => {
  assert.equal(supportReplySchema.safeParse({ text: 'Готово, поправил' }).success, true);
  assert.equal(supportReplySchema.safeParse({ text: '   ' }).success, false);
});
test('stampsForStatus: «Отвечено» ставит дату ответа, «Закрыта» — дату закрытия', () => {
  assert.ok(stampsForStatus('Отвечено').answeredAt instanceof Date);
  assert.ok(stampsForStatus('Закрыта').closedAt instanceof Date);
});
test('stampsForStatus: возврат в работу снимает отметку закрытия', () => {
  assert.equal(stampsForStatus('В работе').closedAt, null);
  assert.equal(stampsForStatus('Новая').closedAt, null);
});
test('isOpenTicket: открыта всё, кроме «Закрыта»', () => {
  assert.equal(isOpenTicket('Новая'), true);
  assert.equal(isOpenTicket('Отвечено'), true);
  assert.equal(isOpenTicket('Закрыта'), false);
});
