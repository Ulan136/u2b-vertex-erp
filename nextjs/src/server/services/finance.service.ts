import { db, type Executor } from '@/db';
import { financeRepo } from '@/server/repositories/finance.repo';
import { expenseCategoriesRepo } from '@/server/repositories/expenseCategories.repo';
import { employeesRepo } from '@/server/repositories/employees.repo';
import { permissionsRepo } from '@/server/repositories/permissions.repo';
import { isCategoryVisible } from '@/server/dto/permissions.dto';
import { randomUUID } from 'crypto';
import {
  financeOperationSchema, financeOpMetaSchema, expenseCreateSchema, expensePaymentsTotal,
  accountCreateSchema, accountUpdateSchema, balanceDeltas,
} from '@/server/dto/finance.dto';
import { badRequest, notFound } from '@/server/lib/errors';
import { formatDate } from '@/lib/format';

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
      comment: `Отмена операции от ${formatDate(orig.opDate)}`,
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
  return db.transaction(async (tx) => {
    const patch: Record<string, unknown> = {};
    if (d.name !== undefined) patch.name = d.name;
    if (d.section !== undefined) patch.section = d.section;
    if (d.category !== undefined) patch.category = d.category;
    if (d.icon !== undefined) patch.icon = d.icon;
    let acc = Object.keys(patch).length ? await financeRepo.updateAccount(id, patch, tx) : await financeRepo.findAccount(id, tx);
    // Правка начального остатка: обновляем операцию «Старт» и двигаем баланс на разницу.
    if (d.startBalance !== undefined) {
      const newStart = Math.round((Number(d.startBalance) || 0) * 100) / 100;
      const startOp = await financeRepo.findStartOp(id, tx);
      if (startOp) {
        const delta = newStart - (Number(startOp.amount) || 0);
        await financeRepo.updateOperation(startOp.id, { amount: String(newStart) }, tx);
        if (delta !== 0) await financeRepo.adjustBalance(id, delta, tx);
      } else if (newStart !== 0) {
        await createOperation({ opType: 'Приход', accountId: id, amount: newStart, name: 'Начальный остаток', accountName: acc?.name, source: 'Старт' }, null, tx);
      }
      acc = await financeRepo.findAccount(id, tx);
    }
    return acc;
  });
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
    // Зарплата: удалить связанную запись выплаты в кадрах (иначе «выплачено»
    // останется висеть, хотя деньги вернулись). Удаляем ДО сторно операций.
    for (const t of targets) {
      if (t.source === 'Зарплата') {
        const pay = await employeesRepo.findPaymentByOpId(t.id as string, tx);
        if (pay) await employeesRepo.removePayment(pay.id, tx);
      }
    }
    const done = [];
    for (const t of targets) done.push(await reverseOperation(t.id, actorId ?? null, tx));
    return { ok: true, reversed: done.filter(Boolean).length };
  });
}

// Категория операции — как на клиенте (expense_cat, иначе Зарплата/из имени).
const opCategory = (o: { expenseCat?: string | null; source?: string | null; name?: string | null }) =>
  o.expenseCat || (o.source === 'Зарплата' ? 'Зарплата' : (o.name || '').split(':')[0].trim() || 'Прочие');

async function overview(from?: string | null, to?: string | null, role?: string | null) {
  const data = await financeRepo.overview(from, to);
  if (role === 'admin') return data;   // Админ всегда видит всё
  // Видимость категорий расходов — по ролям (карта «Настройки → Доступы»);
  // для незаданных явно категорий действует legacy-флаг managerHidden.
  const [perms, cats] = await Promise.all([permissionsRepo.list(), expenseCategoriesRepo.listAll()]);
  const hidden = new Set(cats.filter(c => !c.parentId && !isCategoryVisible(role || '', c.id, !!c.managerHidden, perms)).map(c => c.name));
  if (!hidden.size) return data;
  const operations = (data.operations as Array<{ opType?: string | null; expenseCat?: string | null; source?: string | null; name?: string | null }>)
    .filter(o => !(o.opType === 'Расход' && hidden.has(opCategory(o))));
  return { ...data, operations };
}

// Сменить счёт списания у расхода (при ошибочной отправке). Безопасно: сторно
// старой операции (деньги вернутся на прежний счёт) + новая операция на нужном
// счёте с теми же данными. Для зарплаты перепривязываем запись выплаты в кадрах.
// Смешанный расход (несколько счетов) — не поддерживаем (менять удалением/вводом).
async function changeExpenseAccount(opId: string, newAccountId: string, actorId?: string | null) {
  if (!opId) throw badRequest('id обязателен');
  if (!newAccountId) throw badRequest('Выберите новый счёт');
  return db.transaction(async (tx) => {
    const op = await financeRepo.findOperation(opId, tx);
    if (!op) throw notFound('Операция не найдена');
    if (op.opType !== 'Расход') throw badRequest('Смена счёта — только для расходов');
    // Только настоящие расходы/зарплата. Долг/закуп/продажа тоже видны как Расход,
    // но у них свои связанные записи — их счёт меняют на их экране.
    if (op.source !== 'Расходы' && op.source !== 'Зарплата') throw badRequest('Смена счёта доступна для расходов и зарплаты. Для оплаты долга/закупа/продажи — меняйте на их экране (удалить и провести заново).');
    if (op.reversedAt || op.reverses) throw badRequest('Операция уже отменена');
    if (op.expenseGroupId) {
      const group = (await financeRepo.findByGroup(op.expenseGroupId, tx)).filter(o => !o.reversedAt && !o.reverses);
      if (group.length > 1) throw badRequest('Расход с нескольких счетов — смените удалением и повторным вводом');
    }
    if (op.accountId === newAccountId) return { ok: true, unchanged: true };
    const acc = await financeRepo.findAccount(newAccountId, tx);
    if (!acc) throw badRequest('Новый счёт не найден');
    await reverseOperation(op.id, actorId ?? null, tx);   // сторно старой (деньги назад)
    const newOp = await createOperation({
      opType: 'Расход', accountId: newAccountId, amount: op.amount, name: op.name, accountName: acc.name,
      source: op.source ?? undefined, opDate: op.opDate ?? undefined, comment: op.comment ?? undefined,
      expenseCat: op.expenseCat ?? undefined, subCategory: op.subCategory ?? undefined, supplier: op.supplier ?? undefined,
      docNo: op.docNo ?? undefined, status: op.status ?? undefined, orderId: op.orderId ?? undefined,
      expenseGroupId: op.expenseGroupId ?? undefined, saleId: op.saleId ?? undefined, certId: op.certId ?? undefined,
    }, actorId ?? null, tx);
    if (op.source === 'Зарплата') {   // перепривязать запись выплаты в кадрах
      const pay = await employeesRepo.findPaymentByOpId(op.id, tx);
      if (pay) await employeesRepo.updatePayment(pay.id, { accountId: newAccountId, financeOpId: newOp?.id ?? null }, tx);
    }
    return { ok: true, newOpId: newOp?.id ?? null };
  });
}

export const financeService = {
  overview,
  createOperation,
  createExpense,
  reverseOperation,
  reverseExpense,
  changeExpenseAccount,
  updateOperationMeta,
  createAccount,
  updateAccount,
};
