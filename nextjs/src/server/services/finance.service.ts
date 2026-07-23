import { db, type Executor } from '@/db';
import { financeRepo } from '@/server/repositories/finance.repo';
import { randomUUID } from 'crypto';
import {
  financeOperationSchema, financeOpMetaSchema, expenseCreateSchema, expensePaymentsTotal,
  accountCreateSchema, accountUpdateSchema, balanceDeltas,
} from '@/server/dto/finance.dto';
import { badRequest, notFound } from '@/server/lib/errors';

// Вставить операцию + сдвинуть балансы задействованных счетов (в рамках exec).
async function insertOperation(
  insert: Record<string, unknown>,
  opType: string, amount: string | number, accountId: string, toAccountId: string | null | undefined,
  exec: Executor,
) {
  const row = await financeRepo.createOperation(insert, exec);
  for (const { id, delta } of balanceDeltas(opType, amount, accountId, toAccountId)) {
    await financeRepo.adjustBalance(id, delta, exec);
  }
  return row;
}

// Создать операцию и сдвинуть балансы. Атомарно: если exec не передан — открываем
// свою транзакцию (операция + движение баланса всегда фиксируются вместе).
// Собираем только заданные поля — undefined для uuid/date колонок ломает вставку.
async function createOperation(input: unknown, actorId?: string | null, exec?: Executor) {
  const data = financeOperationSchema.parse(input);
  const insert: Record<string, unknown> = {
    name: data.name,
    accountId: data.accountId,
    opType: data.opType,
    amount: String(Number(data.amount) || 0),
    createdBy: actorId ?? null,
  };
  if (data.opDate) insert.opDate = data.opDate;
  if (data.accountName) insert.accountName = data.accountName;
  if (data.source) insert.source = data.source;
  if (data.certId) insert.certId = data.certId;
  if (data.saleId) insert.saleId = data.saleId;
  if (data.comment) insert.comment = data.comment;
  if (data.expenseCat) insert.expenseCat = data.expenseCat;
  if (data.subCategory) insert.subCategory = data.subCategory;
  if (data.supplier) insert.supplier = data.supplier;
  if (data.docNo) insert.docNo = data.docNo;
  if (data.status) insert.status = data.status;
  if (data.orderId) insert.orderId = data.orderId;
  if (data.expenseGroupId) insert.expenseGroupId = data.expenseGroupId;

  const run = (e: Executor) => insertOperation(insert, data.opType, data.amount, data.accountId, data.toAccountId, e);
  return exec ? run(exec) : db.transaction(run);
}

// Отмена операции СТОРНО-операцией (не молчаливый DELETE): создаём обратную
// операцию, ссылающуюся на исходную, и помечаем исходную reversedAt. В истории
// видно и приход, и его отмену — это заодно начало аудита.
async function reverseOperation(id: string, actorId?: string | null, exec?: Executor) {
  const run = async (e: Executor) => {
    const orig = await financeRepo.findOperation(id, e);
    if (!orig || orig.reversedAt) return null;                 // нет или уже отменена
    const invType = orig.opType === 'Приход' ? 'Расход' : orig.opType === 'Расход' ? 'Приход' : null;
    if (!invType) return null;                                 // Перевод/иное без сохранённого 2-го счёта не сторнируем
    const insert: Record<string, unknown> = {
      name: `Сторно: ${orig.name}`.slice(0, 200),
      accountId: orig.accountId,
      opType: invType,
      amount: String(orig.amount),
      reverses: orig.id,
      comment: `Отмена операции от ${String(orig.opDate ?? '').slice(0, 10)}`,
      createdBy: actorId ?? null,
    };
    if (orig.accountName) insert.accountName = orig.accountName;
    if (orig.source) insert.source = orig.source;
    const rev = await insertOperation(insert, invType, orig.amount, orig.accountId, null, e);
    await financeRepo.markReversed(orig.id, e);
    return rev;
  };
  return exec ? run(exec) : db.transaction(run);
}

// Счёт стартует с балансом 0; начальный остаток заводится ОПЕРАЦИЕЙ
// «Начальный остаток» (баланс всегда = сумма операций). Атомарно.
async function createAccount(input: unknown, actorId?: string | null) {
  const d = accountCreateSchema.parse(input);
  return db.transaction(async (tx) => {
    const acc = await financeRepo.createAccount({
      name: d.name, category: d.category, section: d.section, icon: d.icon || '💳', balance: '0',
    }, tx);
    const start = Number(d.balance) || 0;
    if (start > 0 && acc) {
      await createOperation(
        { opType: 'Приход', accountId: acc.id, amount: start, name: 'Начальный остаток', accountName: acc.name, source: 'Старт' },
        actorId, tx,
      );
      (acc as { balance?: string }).balance = String(start.toFixed(2));
    }
    return acc;
  });
}

async function updateAccount(id: string, input: unknown) {
  const d = accountUpdateSchema.parse(input);
  const patch: Record<string, unknown> = {};
  if (d.name !== undefined) patch.name = d.name;
  if (d.section !== undefined) patch.section = d.section;
  if (d.icon !== undefined) patch.icon = d.icon;
  return financeRepo.updateAccount(id, patch);
}

// Правка МЕТАДАННЫХ операции (описание/поставщик/№док/статус/категория/дата/
// комментарий/заказ) — БЕЗ суммы, счёта и типа: балансы не затрагиваются.
async function updateOperationMeta(id: string, input: unknown) {
  if (!id) throw badRequest('id обязателен');
  const d = financeOpMetaSchema.parse(input);
  const patch: Record<string, unknown> = {};
  for (const k of ['name', 'opDate', 'comment', 'expenseCat', 'subCategory', 'supplier', 'docNo', 'status', 'orderId'] as const) {
    if (d[k] !== undefined) patch[k] = d[k] === '' ? null : d[k];
  }
  const row = await financeRepo.updateOperation(id, patch);
  if (!row) throw notFound('Операция не найдена');
  return row;
}

// Расход с НЕСКОЛЬКИХ счетов: каждая строка → свой Расход в финансах на своём
// счёте, все делят expense_group_id — всё в ОДНОЙ транзакции.
async function createExpense(input: unknown, actorId?: string | null) {
  const d = expenseCreateSchema.parse(input);
  const groupId = randomUUID();
  const meta = { name: d.name || 'Расход', source: 'Расходы', opDate: d.opDate || undefined, comment: d.comment || undefined, expenseCat: d.expenseCat || undefined, subCategory: d.subCategory || undefined, supplier: d.supplier || undefined, docNo: d.docNo || undefined, status: d.status || undefined, orderId: d.orderId || undefined };
  return db.transaction(async (tx) => {
    const ops = [];
    for (const p of d.payments) {
      ops.push(await createOperation({ ...meta, opType: 'Расход', accountId: p.accountId, amount: p.amount, expenseGroupId: groupId }, actorId, tx));
    }
    return { groupId, count: ops.length, total: expensePaymentsTotal(d.payments), ops };
  });
}

// Отмена расхода: если у операции есть группа — сторнируем ВСЕ её действующие
// операции по своим счетам; иначе — только одну. Всё в одной транзакции.
async function reverseExpense(id: string, actorId?: string | null) {
  if (!id) throw badRequest('id обязателен');
  return db.transaction(async (tx) => {
    const op = await financeRepo.findOperation(id, tx);
    if (!op) throw notFound('Операция не найдена');
    const targets = op.expenseGroupId
      ? (await financeRepo.findByGroup(op.expenseGroupId, tx)).filter(o => !o.reversedAt && !o.reverses)
      : [op];
    const done = [];
    for (const t of targets) done.push(await reverseOperation(t.id, actorId ?? null, tx));
    return { ok: true, reversed: done.filter(Boolean).length };
  });
}

export const financeService = {
  overview: (from?: string | null, to?: string | null) => financeRepo.overview(from, to),
  createOperation,
  createExpense,
  reverseOperation,
  reverseExpense,
  updateOperationMeta,
  createAccount,
  updateAccount,
};
