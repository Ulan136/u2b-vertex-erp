import { db, type Executor } from '@/db';
import { randomUUID } from 'crypto';
import { productsRepo } from '@/server/repositories/products.repo';
import { financeRepo } from '@/server/repositories/finance.repo';
import { financeService } from '@/server/services/finance.service';
import { stockMovementSchema, productUpdateSchema, purchaseCreateSchema, purchaseUpdateSchema, purchasePaySchema, STOCK_SIGN, canApplyStock } from '@/server/dto/products.dto';
import { badRequest, notFound } from '@/server/lib/errors';

export { STOCK_SIGN };
const money = (n: number) => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);
type Actor = { id: string; name?: string } | null | undefined;

// Провести движение склада + сдвинуть остаток товара — атомарно (движение и
// остаток фиксируются вместе). Запрет ухода остатка в минус.
async function doMovement(input: unknown, actor: { id: string; name?: string } | null | undefined, exec: Executor) {
  const data = stockMovementSchema.parse(input);
  const product = await productsRepo.findById(String(data.productId), exec);
  if (!product) throw notFound('Товар не найден');
  const qty = Math.abs(Number(data.qty) || 0);
  if (qty <= 0) throw badRequest('Количество должно быть больше 0');
  const sign = STOCK_SIGN[data.moveType] ?? 0;
  if (!sign) throw badRequest('Неизвестный тип движения');
  const price = Number(data.price ?? product.price ?? 0);

  // Запрет отрицательного остатка: списание не может увести current_stock ниже 0.
  const current = Number(product.currentStock) || 0;
  if (!canApplyStock(current, data.moveType, qty)) {
    throw badRequest(`Недостаточно товара на складе «${product.name}»: остаток ${current}, требуется ${qty}`);
  }

  const movement = await productsRepo.createMovement({
    productId: product.id,
    skuCode: product.skuCode,
    productName: product.name,
    moveType: data.moveType,
    qty,
    price: money(price),
    totalSum: money(qty * price),
    supplier: data.supplier ?? null,
    docNo: data.docNo ?? null,
    comment: data.comment ?? null,
    author: data.author ?? actor?.name ?? null,
    moveDate: data.moveDate ?? undefined,
    createdBy: actor?.id ?? null,
  }, exec);
  await productsRepo.adjustStock(product.id, sign * qty, exec);
  // Приход обновляет себестоимость товара (последняя цена закупки).
  if (data.moveType === 'IN' && price > 0) {
    await productsRepo.update(product.id, { costPrice: money(price) }, exec);
  }
  return movement;
}

export const productsService = {
  list: () => productsRepo.listActive(),
  movements: (limit?: number, type?: string | null, from?: string | null, to?: string | null) =>
    productsRepo.listMovements(limit, type, from, to),

  // Сводка Приход/Расход по SKU за период (только чтение) — числа приведены к number.
  async movementsSummary(from?: string | null, to?: string | null) {
    const rows = await productsRepo.movementsSummary(from, to);
    return rows.map(r => ({
      skuCode: r.skuCode,
      inQty: Number(r.inQty) || 0,
      outQty: Number(r.outQty) || 0,
      revPlus: Number(r.revPlus) || 0,
      revMinus: Number(r.revMinus) || 0,
    }));
  },

  // Правка карточки товара (наименование/мин.остаток/цены/тип воды/группа).
  async update(id: string, input: unknown) {
    const d = productUpdateSchema.parse(input);
    const patch: Record<string, unknown> = {};
    if (d.name !== undefined) patch.name = d.name;
    if (d.fullName !== undefined) patch.fullName = d.fullName || null;
    if (d.minStock !== undefined) patch.minStock = d.minStock;
    if (d.price !== undefined) patch.price = money(Number(d.price) || 0);
    if (d.priceDiscount !== undefined) patch.priceDiscount = money(Number(d.priceDiscount) || 0);
    if (d.costPrice !== undefined) patch.costPrice = money(Number(d.costPrice) || 0);
    if (d.waterType !== undefined) patch.waterType = d.waterType || null;
    if (d.groupId !== undefined) patch.groupId = d.groupId || null;
    const row = await productsRepo.update(id, patch);
    if (!row) throw notFound('Товар не найден');
    return row;
  },

  // exec передаётся, когда движение — часть внешней транзакции (напр. продажи);
  // иначе открываем свою, чтобы движение и остаток всегда были согласованы.
  async createMovement(input: unknown, actor?: { id: string; name?: string } | null, exec?: Executor) {
    return exec ? doMovement(input, actor, exec) : db.transaction((tx) => doMovement(input, actor, tx));
  },

  // ── ЗАКУП: приход товара (склад + себестоимость) + опциональная оплата со счёта(ов) ──
  // Всё одной транзакцией. Новый товар (нет SKU) заводится автоматически. Оплата
  // (payments[]) → Расход(ы) в Финансах source='Закуп', связанные с движением через
  // finance_group (для совместной отмены денег и склада). Без оплаты — только склад
  // (закуп в долг / бесплатно).
  async createPurchase(input: unknown, actor?: Actor) {
    const d = purchaseCreateSchema.parse(input);
    return db.transaction(async (tx) => {
      const purchaseGroup = randomUUID();
      const financeGroup = d.payments.length ? randomUUID() : null;
      let firstName = '';
      // 1. каждая позиция: товар (существующий/новый) → приход на склад
      for (const it of d.items) {
        let product;
        if (it.productId) {
          product = await productsRepo.findById(it.productId, tx);
          if (!product) throw notFound('Товар не найден');
        } else {
          const np = it.newProduct!;
          product = await productsRepo.findBySku(np.skuCode.trim(), tx);
          if (!product) {
            product = await productsRepo.createProduct({
              skuCode: np.skuCode.trim(), name: np.name.trim(),
              minStock: np.minStock ?? 5,
              price: money(Number(np.price) || 0),
              costPrice: money(it.price),
              waterType: np.waterType || null,
            }, tx);
          }
        }
        if (!firstName) firstName = product!.name;
        const movement = await doMovement({
          productId: product!.id, moveType: 'IN', qty: it.qty, price: it.price,
          supplier: d.supplier ?? null, docNo: d.docNo ?? null,
          moveDate: d.moveDate ?? undefined, comment: d.comment ?? 'Закупка',
        }, actor, tx);
        await productsRepo.updateMovement(movement.id, { purchaseGroup, ...(financeGroup ? { financeGroup } : {}) }, tx);
      }
      // 2. оплата: Расход(ы) в финансах на весь закуп, связанные общей группой
      if (financeGroup) {
        const name = (d.items.length > 1 ? `Закуп: ${firstName} +${d.items.length - 1} поз.` : `Закуп: ${firstName} ×${d.items[0].qty}`).slice(0, 200);
        for (const p of d.payments) {
          await financeService.createOperation({
            opType: 'Расход', accountId: p.accountId, amount: p.amount,
            name, source: 'Закуп', supplier: d.supplier || undefined, docNo: d.docNo || undefined,
            opDate: d.moveDate || undefined, expenseGroupId: financeGroup,
          }, actor?.id ?? null, tx);
        }
      }
      return { ok: true, count: d.items.length, purchaseGroup };
    });
  },

  // ── Отмена/удаление движения склада (закупа/прихода/расхода/ревизии) ──
  // hard=false («Отменить»): откат остатка + сторно связанных денег, строка остаётся
  //   помеченной reversedAt (для истории). hard=true («Удалить»): то же + удаление строки.
  // Идемпотентно (повторная отмена ничего не задваивает). Движения поверки не трогаем.
  async reverseMovement(id: string, opts: { hard?: boolean }, actor?: Actor) {
    if (!id) throw badRequest('id обязателен');
    return db.transaction(async (tx) => {
      const m = await productsRepo.findMovement(id, tx);
      if (!m) throw notFound('Движение не найдено');
      if (m.certId) throw badRequest('Движение поверки — отменяется удалением поверки, не здесь');
      // Мультипозиционный закуп: отменяем/удаляем весь закуп (все его приходы), иначе одну строку.
      const group = m.purchaseGroup ? await productsRepo.movementsByPurchaseGroup(m.purchaseGroup, tx) : [m];
      // 1. откат остатков по каждой действующей позиции (с защитой от ухода в минус)
      for (const mv of group) {
        if (mv.reversedAt) continue;
        const sign = STOCK_SIGN[mv.moveType] ?? 0;
        const undo = -sign * (Number(mv.qty) || 0);
        const product = await productsRepo.findById(mv.productId, tx);
        const cur = Number(product?.currentStock) || 0;
        if (cur + undo < 0) throw badRequest(`Нельзя отменить: остаток «${mv.productName}» уйдёт в минус (товар уже израсходован/продан)`);
        if (sign) await productsRepo.adjustStock(mv.productId, undo, tx);
      }
      // 2. вернуть деньги: сторнировать связанную группу расходов (один раз на весь закуп)
      if (m.financeGroup) {
        const ops = await financeRepo.findByGroup(m.financeGroup, tx);
        for (const op of ops) if (!op.reversedAt && !op.reverses) await financeService.reverseOperation(op.id, actor?.id ?? null, tx);
      }
      // 3. пометить/удалить строки
      for (const mv of group) {
        if (opts.hard) await productsRepo.deleteMovement(mv.id, tx);
        else if (!mv.reversedAt) await productsRepo.markMovementReversed(mv.id, tx);
      }
      return { ok: true, count: group.length };
    });
  },

  // ── Правка метаданных закупа (дата закупа / поставщик / № документа) ──
  // Меняет всю группу мультизакупа. Кол-во/цену/оплату НЕ трогает. Дату оплаты
  // (финоперацию) НЕ двигает — оплата это отдельный факт (у долга payDate ≠ дата
  // закупа). Поставщика/№ синхронизирует и в связанных расходах (косметика).
  async updatePurchase(id: string, input: unknown) {
    if (!id) throw badRequest('id обязателен');
    const { moveDate, supplier, docNo } = purchaseUpdateSchema.parse(input);
    return db.transaction(async (tx) => {
      const m = await productsRepo.findMovement(id, tx);
      if (!m) throw notFound('Закуп не найден');
      if (m.certId) throw badRequest('Движение поверки — правится через поверку, не здесь');
      if (m.reversedAt) throw badRequest('Отменённый закуп редактировать нельзя');
      const group = m.purchaseGroup ? await productsRepo.movementsByPurchaseGroup(m.purchaseGroup, tx) : [m];
      const patch: Record<string, unknown> = {};
      if (moveDate !== undefined) patch.moveDate = moveDate || null;
      if (supplier !== undefined) patch.supplier = supplier || null;
      if (docNo !== undefined) patch.docNo = docNo || null;
      if (Object.keys(patch).length) {
        for (const mv of group) if (!mv.reversedAt) await productsRepo.updateMovement(mv.id, patch, tx);
      }
      // Поставщик/№ — обновить и в связанных расходах (дату оплаты не трогаем).
      if (m.financeGroup && (supplier !== undefined || docNo !== undefined)) {
        const ops = await financeRepo.findByGroup(m.financeGroup, tx);
        for (const op of ops) {
          if (op.reversedAt || op.reverses) continue;
          const opatch: Record<string, unknown> = {};
          if (supplier !== undefined) opatch.supplier = supplier || null;
          if (docNo !== undefined) opatch.docNo = docNo || null;
          if (Object.keys(opatch).length) await financeRepo.updateOperation(op.id, opatch, tx);
        }
      }
      return { ok: true };
    });
  },

  // ── Погашение долга по закупу ──
  // Долговой закуп (без finance_group) → создаём Расход(ы) со счёта(ов) на всю
  // стоимость, дата оплаты = payDate или СЕГОДНЯ (закуп мог быть раньше), и
  // проставляем finance_group на все позиции. Идемпотентно: уже оплаченный — ошибка.
  async payPurchaseDebt(id: string, input: unknown, actor?: Actor) {
    if (!id) throw badRequest('id обязателен');
    const { payments, payDate } = purchasePaySchema.parse(input);
    return db.transaction(async (tx) => {
      const m = await productsRepo.findMovement(id, tx);
      if (!m) throw notFound('Закуп не найден');
      if (m.reversedAt) throw badRequest('Отменённый закуп нельзя оплатить');
      if (m.financeGroup) throw badRequest('Этот закуп уже оплачен');
      const group = m.purchaseGroup ? await productsRepo.movementsByPurchaseGroup(m.purchaseGroup, tx) : [m];
      const live = group.filter(mv => !mv.reversedAt);
      const cost = Math.round(live.reduce((s, mv) => s + (Number(mv.totalSum) || (Number(mv.qty) || 0) * (Number(mv.price) || 0)), 0) * 100) / 100;
      if (cost <= 0) throw badRequest('У закупа нулевая стоимость');
      const paid = Math.round(payments.reduce((s, p) => s + (Number(p.amount) || 0), 0) * 100) / 100;
      if (Math.abs(paid - cost) > 0.01) throw badRequest(`Сумма оплат (${money(paid)}) должна равняться долгу (${money(cost)})`);
      const financeGroup = randomUUID();
      const first = live[0]?.productName || '';
      const name = (live.length > 1 ? `Погашение долга: ${first} +${live.length - 1} поз.` : `Погашение долга: ${first} ×${live[0]?.qty ?? ''}`).slice(0, 200);
      for (const p of payments) {
        await financeService.createOperation({
          opType: 'Расход', accountId: p.accountId, amount: money(p.amount),
          name, source: 'Закуп', supplier: m.supplier || undefined, docNo: m.docNo || undefined,
          opDate: payDate || undefined, expenseGroupId: financeGroup,
        }, actor?.id ?? null, tx);
      }
      for (const mv of live) await productsRepo.updateMovement(mv.id, { financeGroup }, tx);
      return { ok: true, cost: money(cost) };
    });
  },

  // Приводит списание клейма поверки к нужному состоянию (идемпотентно):
  //   marker='СЛ'|'ПЛ' → должно быть ровно одно OUT-движение на этот расходник;
  //   marker=null       → списаний быть не должно (не оплачено / не поверка).
  // Так корректно отрабатывают переходы статуса оплаты (В ожидании↔Оплачено) и
  // смена типа клейма. Backorder разрешён — поверка не падает из-за нуля на складе;
  // если расходник не заведён — молча пропускаем.
  async syncCertSeal(cert: { id: string; serialNo?: string | null }, marker: string | null, actor: { id: string; name?: string } | null | undefined, exec: Executor) {
    const existing = await productsRepo.movementsByCert(cert.id, exec);
    const target = marker ? await productsRepo.findConsumableByMarker(marker, exec) : null;
    // Уже правильно: ровно одно движение и оно на нужный расходник.
    if (target && existing.length === 1 && existing[0].productId === target.id) return;
    if (!target && existing.length === 0) return;
    // Иначе приводим к нужному состоянию: сначала откат всего лишнего, потом списание.
    if (existing.length) await this.releaseCertConsumables(cert.id, exec);
    if (target) {
      // Не уводим клеймо в минус: если на складе 0 — поверка создаётся, но списание
      // не проводим (остаток не станет отрицательным). Фактический остаток
      // выставляется ревизией. Когда клейма появятся — спишутся при следующей синхре.
      if ((Number(target.currentStock) || 0) <= 0) return;
      const price = Number(target.costPrice ?? target.price ?? 0);
      await productsRepo.createMovement({
        productId: target.id, skuCode: target.skuCode, productName: target.name,
        moveType: 'OUT', qty: 1, price: money(price), totalSum: money(price),
        certId: cert.id,
        comment: `Поверка${cert.serialNo ? ' №' + cert.serialNo : ''} — клеймо ${marker}`,
        author: actor?.name ?? null, createdBy: actor?.id ?? null,
      }, exec);
      await productsRepo.adjustStock(target.id, -1, exec);
    }
  },

  // Возврат расходников при удалении поверки (или перед пересписанием): откатываем
  // влияние каждого движения на остаток и удаляем строку (иначе FK cert_id не даст
  // удалить сертификат).
  async releaseCertConsumables(certId: string, exec: Executor) {
    const mvs = await productsRepo.movementsByCert(certId, exec);
    for (const m of mvs) {
      const sign = STOCK_SIGN[m.moveType] ?? 0;
      if (sign) await productsRepo.adjustStock(m.productId, -sign * Number(m.qty), exec);
      await productsRepo.deleteMovement(m.id, exec);
    }
  },
};
