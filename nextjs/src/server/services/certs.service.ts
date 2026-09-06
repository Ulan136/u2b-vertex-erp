import { z } from 'zod';
import { db, type Executor } from '@/db';
import { certsRepo } from '@/server/repositories/certs.repo';
import { certUpsertSchema, certUpdateSchema, cleanCertFields, isCertPaid, poverkaPaymentSchema, payByClientSchema, commissionPaySchema, sectionForCertSource, certIncomePosts, certIncomeAmount, type CertQuery } from '@/server/dto/certs.dto';
import { deviceTypesService } from '@/server/services/deviceTypes.service';
import { productsService } from '@/server/services/products.service';
import { financeService } from '@/server/services/finance.service';
import { financeRepo } from '@/server/repositories/finance.repo';
import { sealMarker } from '@/server/dto/products.dto';
import { usersRepo } from '@/server/repositories/users.repo';
import { BRANCH_ROLE } from '@/server/dto/permissions.dto';
import { badRequest, notFound } from '@/server/lib/errors';

const m2 = (n: unknown) => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);

// Какое клеймо должно быть списано у ИТОГОВОГО состояния поверки:
// расходуется только у ОПЛАЧЕННОЙ поверки (docType='cert'); иначе — ничего.
function sealFor(cert: { docType?: string | null; sealType?: string | null; payStatus?: string | null }): 'СЛ' | 'ПЛ' | null {
  return isCertPaid(cert.payStatus) ? sealMarker(cert.docType, cert.sealType) : null;
}

// ── Доход прямого сертификата/извещения (смешанная оплата → приход на счета) ──
type CertRow = { id: string; source?: string | null; payStatus?: string | null; amount?: unknown; paidAmount?: unknown; commissionPaidAt?: unknown; docType?: string | null; serialNo?: string | null; checkDate?: unknown; client?: string | null };
type PayLine = { accountId: string; amount: number };

// Сторнируем действующий доход сертификата (обратной операцией, баланс к нулю).
async function reverseCertIncome(certId: string, actor: { id: string; name?: string } | null | undefined, tx: Executor) {
  const ops = (await financeRepo.findByCert(certId, tx)).filter(o => o.opType === 'Приход' && !o.reversedAt && !o.reverses);
  for (const o of ops) await financeService.reverseOperation(o.id, actor?.id ?? null, tx);
  return ops.length;
}

// Раскладка дохода: явные строки оплаты или (пусто) весь доход на счёт раздела.
// Цель = фактически внесённая сумма (полная цена или частичная — см. certIncomeAmount).
async function resolveCertAlloc(cert: CertRow, payments: PayLine[] | undefined, tx: Executor): Promise<PayLine[]> {
  const amount = certIncomeAmount(cert);
  let alloc = (payments || []).map(p => ({ accountId: String(p.accountId), amount: Math.round((Number(p.amount) || 0) * 100) / 100 })).filter(p => p.accountId && p.amount > 0);
  if (!alloc.length) {
    const acc = await financeRepo.defaultAccount(sectionForCertSource(cert.source), tx);
    if (!acc) throw badRequest('Нет счёта для дохода — заведите счёт в разделе (Финансы → Привязка счетов)');
    alloc = [{ accountId: acc.id, amount }];
  }
  const sum = alloc.reduce((s, p) => s + p.amount, 0);
  if (Math.abs(sum - amount) > 0.01) throw badRequest(`Сумма оплат (${m2(sum)}) должна равняться внесённой сумме (${m2(amount)})`);
  return alloc;
}

// Идемпотентная сверка дохода: приводит доход сертификата к нужному состоянию
// (оплачено+не Выездная+цена>0 → приход по раскладке; иначе → сторно). Не трогает
// уже проведённый доход, если раскладка не изменилась (правка не-оплатных полей).
async function syncCertIncome(cert: CertRow, payments: PayLine[] | undefined, actor: { id: string; name?: string } | null | undefined, tx: Executor) {
  const existing = (await financeRepo.findByCert(cert.id, tx)).filter(o => o.opType === 'Приход' && !o.reversedAt && !o.reverses);
  if (!certIncomePosts(cert)) { if (existing.length) await reverseCertIncome(cert.id, actor, tx); return; }
  // Оплату не меняли (payments не переданы) и уже проведён доход на нужную сумму —
  // не трогаем (сохраняем разбивку по счетам, вкл. частичные/смешанные оплаты).
  const target = certIncomeAmount(cert);
  if ((!payments || !payments.length) && existing.length) {
    const have = Math.round(existing.reduce((s, o) => s + (Number(o.amount) || 0), 0) * 100) / 100;
    if (Math.abs(have - target) <= 0.01) return;
  }
  const alloc = await resolveCertAlloc(cert, payments, tx);
  const norm = (arr: PayLine[]) => arr.map(p => `${p.accountId}:${p.amount.toFixed(2)}`).sort().join('|');
  if (existing.length && norm(existing.map(o => ({ accountId: o.accountId as string, amount: Number(o.amount) }))) === norm(alloc)) return;
  if (existing.length) await reverseCertIncome(cert.id, actor, tx);
  const src = sectionForCertSource(cert.source) === 'branch' ? 'Филиал' : 'Поверка';
  for (const p of alloc) {
    const acc = await financeRepo.findAccount(p.accountId, tx);
    if (!acc) throw badRequest('Счёт оплаты не найден');
    await financeService.createOperation(
      { opType: 'Приход', accountId: p.accountId, amount: m2(p.amount), name: `${cert.docType === 'izv' ? 'Извещение' : 'Сертификат'} ${cert.source || ''}${cert.serialNo ? ' №' + cert.serialNo : ''}`.slice(0, 200), source: src, certId: cert.id, accountName: acc.name },
      actor?.id ?? null, tx,
    );
  }
}

export const certsService = {
  async list(q: CertQuery, viewer?: { id: string; role?: string | null } | null) {
    // Роль 'branch' видит только сертификаты/извещения своего филиала (скоуп по branchId).
    const branchId = viewer?.role === BRANCH_ROLE ? await usersRepo.branchOf(viewer.id) : null;
    return certsRepo.list({
      source: q.source ?? null,
      archived: q.archived ?? false,
      type: q.orderId ? null : (q.type || 'cert'),   // по заявке — все её сертификаты, без фильтра по типу
      orderId: q.orderId ?? null,
      branchId,   // null у обычных ролей → без фильтра по филиалу (как было)
    });
  },

  // Текущий счёт оплаты сертификата. Для Выездной доход проведён на уровне
  // ЗАЯВКИ (orderId), для прямых — на уровне серта (certId). Возвращает счета,
  // на которых сейчас лежит приход, и сумму — для показа/смены в модалке.
  async payInfo(certId: string) {
    const cert = await certsRepo.findById(certId);
    if (!cert) throw notFound('Сертификат не найден');
    const ops = cert.orderId
      ? await financeRepo.findByOrder(cert.orderId)
      : await financeRepo.findByCert(certId);
    const live = ops.filter(o => o.opType === 'Приход' && !o.reversedAt && !o.reverses);
    const accounts = live.map(o => ({ accountId: o.accountId as string, accountName: (o.accountName as string) || null, amount: Number(o.amount) || 0 }));
    const total = accounts.reduce((s, a) => s + a.amount, 0);
    return { orderId: cert.orderId ?? null, byOrder: !!cert.orderId, accounts, total: m2(total) };
  },

  // Сменить счёт оплаты: сторнируем весь проведённый доход (по заявке или по
  // серту) и заводим один приход на новый счёт на ту же сумму. Для Выездной это
  // меняет счёт оплаты ВСЕЙ заявки (все её позиции). Всё одной транзакцией.
  async changePayAccount(certId: string, input: unknown, actor?: { id: string; name?: string } | null) {
    const { accountId } = z.object({ accountId: z.string().uuid('Выберите счёт') }).parse(input);
    const cert = await certsRepo.findById(certId);
    if (!cert) throw notFound('Сертификат не найден');
    return db.transaction(async (tx) => {
      const ops = cert.orderId
        ? await financeRepo.findByOrder(cert.orderId, tx)
        : await financeRepo.findByCert(certId, tx);
      const live = ops.filter(o => o.opType === 'Приход' && !o.reversedAt && !o.reverses);
      if (!live.length) throw badRequest('Нет проведённого дохода — счёт менять нечего (проверьте, что оплата принята)');
      const total = live.reduce((s, o) => s + (Number(o.amount) || 0), 0);
      const acc = await financeRepo.findAccount(accountId, tx);
      if (!acc) throw badRequest('Счёт не найден');
      const sameOnly = live.length === 1 && live[0].accountId === accountId;
      if (sameOnly) return { ok: true, unchanged: true, account: acc.name, total: m2(total) };
      const name = (live[0].name as string) || 'Поверка (выездная)';
      const src = (live[0].source as string) || 'Поверка';
      for (const o of live) await financeService.reverseOperation(o.id, actor?.id ?? null, tx);
      await financeService.createOperation(
        { opType: 'Приход', accountId, amount: m2(total), name, source: src, accountName: acc.name,
          ...(cert.orderId ? { orderId: cert.orderId } : { certId }) },
        actor?.id ?? null, tx,
      );
      return { ok: true, account: acc.name, total: m2(total) };
    });
  },

  async create(input: unknown, actor?: { id: string; name?: string } | null) {
    const data = certUpsertSchema.parse(input);
    const { payments, ...certData } = data;
    const fields = cleanCertFields(certData);
    // fio/address — NOT NULL в БД без дефолта: гарантируем непустую строку (иначе 500).
    fields.fio ??= '';
    fields.address ??= '';
    // Автор сертификата — для аналитики по сотрудникам (раньше не сохранялся).
    if (actor?.id) fields.createdBy = actor.id;
    // Филиал сертификата — из филиала создателя (для скоупа кабинета филиала),
    // если явно не задан. У головного офиса → его филиал (Тараз).
    if (fields.branchId == null && actor?.id) fields.branchId = await usersRepo.branchOf(actor.id);
    // Сертификат + списание клейма + доход (если «Оплачено», не Выездная) — одной
    // транзакцией. Всё считаем по сохранённой строке (итоговое состояние).
    const row = await db.transaction(async (tx) => {
      const created = await certsRepo.create(fields, tx);
      await productsService.syncCertSeal({ id: created.id, serialNo: created.serialNo }, sealFor(created), actor, tx);
      await syncCertIncome(created, payments, actor, tx);
      return created;
    });
    // Самообучение справочника типов приборов (best-effort, не роняет сохранение).
    if (fields.meterType) await deviceTypesService.touch(fields.meterType);
    return row;
  },

  async update(id: string, input: unknown, actor?: { id: string; name?: string } | null) {
    if (!id) throw badRequest('id is required');
    const data = certUpdateSchema.parse(input);
    const { payments, ...certData } = data;
    const fields = cleanCertFields(certData);
    // нельзя занулять NOT NULL поля — если пришёл null, пишем ''
    if ('fio' in fields && fields.fio == null) fields.fio = '';
    if ('address' in fields && fields.address == null) fields.address = '';
    // Правка + пересверка клейма и дохода (статус оплаты/цена/раскладка могли
    // измениться) — одной транзакцией. Оплатили → приход/клеймо; откатили → сторно.
    const row = await db.transaction(async (tx) => {
      const updated = await certsRepo.update(id, fields, tx);
      if (!updated) return null;
      await productsService.syncCertSeal({ id: updated.id, serialNo: updated.serialNo }, sealFor(updated), actor, tx);
      await syncCertIncome(updated, payments, actor, tx);
      return updated;
    });
    if (!row) throw notFound('Certificate not found');
    if ('meterType' in fields && fields.meterType) await deviceTypesService.touch(fields.meterType);
    return row;
  },

  async remove(id: string, actor?: { id: string; name?: string } | null) {
    if (!id) throw badRequest('id is required');
    // Сторнируем доход (баланс к нулю) + снимаем cert_id с финопер (FK NO ACTION),
    // возвращаем клейма на склад и удаляем поверку — одной транзакцией.
    await db.transaction(async (tx) => {
      await reverseCertIncome(id, actor, tx);
      await financeRepo.detachCert(id, tx);
      await productsService.releaseCertConsumables(id, tx);
      await certsRepo.remove(id, tx);
    });
    return { ok: true };
  },

  // Приём оплаты заявки (выездной мастер): смешанная оплата → приход на счета
  // раздела «Поверка», сертификаты заявки → «Оплачено» + списание клейма. Всё
  // одной транзакцией. Итог = сумма цен позиций; оплаты должны его покрыть.
  async payOrder(orderId: string, input: unknown, actor?: { id: string; name?: string } | null) {
    if (!orderId) throw badRequest('orderId is required');
    const { payments } = poverkaPaymentSchema.parse(input);
    const certs = await certsRepo.list({ orderId, archived: false });
    if (!certs.length) throw badRequest('В заявке нет позиций для оплаты');
    const total = certs.reduce((s, c) => s + Number(c.amount || 0), 0);
    if (total <= 0) throw badRequest('У позиций не указана цена — заполните «Цена» в позициях');
    const paid = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
    if (Math.abs(paid - total) > 0.01) throw badRequest(`Сумма оплат (${m2(paid)}) должна равняться итогу (${m2(total)})`);

    return db.transaction(async (tx) => {
      for (const p of payments) {
        const acc = await financeRepo.findAccount(p.accountId, tx);
        if (!acc) throw badRequest('Счёт оплаты не найден');
        await financeService.createOperation(
          { opType: 'Приход', accountId: p.accountId, amount: m2(p.amount), name: 'Поверка (выездная)', source: 'Поверка', orderId, accountName: acc.name },
          actor?.id ?? null, tx,
        );
      }
      // Все позиции заявки → «Оплачено» (+ списание клейма по каждой).
      for (const c of certs) {
        const upd = await certsRepo.update(c.id, { payStatus: 'Оплачено' }, tx);
        await productsService.syncCertSeal({ id: upd.id, serialNo: upd.serialNo }, sealFor(upd), actor, tx);
      }
      return { ok: true, total: m2(total), count: certs.length };
    });
  },

  // Оплата по клиенту (Блок 1, не Выездная): все ожидающие сертификаты клиента
  // → «Оплачено» по цене за штуку; доход проводится ПО-СЕРТИФИКАТНО (правильно
  // линкуется/сторнируется), смешанная раскладка «жадно» распределяется по
  // сертификатам. Плюс опциональная выплата комиссии клиенту (Расход). Всё —
  // одной транзакцией.
  async payByClient(input: unknown, actor?: { id: string; name?: string } | null) {
    const { source, docType, client, pricePerCert, count: wantCount, dateFrom, dateTo, payments } = payByClientSchema.parse(input);
    if (source === 'Выездная') throw badRequest('Для Выездной оплата идёт через заявку мастера, не здесь');
    const round2 = (n: unknown) => Math.round((Number(n) || 0) * 100) / 100;
    const price = round2(pricePerCert);
    if (price <= 0) throw badRequest('Укажите цену за сертификат');

    const rows = await certsRepo.list({ source, archived: false, type: docType || 'cert' });
    const isoDate = (d: unknown) => (d ? String(d).slice(0, 10) : '');
    const awaiting = rows.filter(c => {
      if ((c.client || '') !== client || isCertPaid(c.payStatus)) return false;
      const d = isoDate(c.checkDate);
      if (dateFrom && d < dateFrom) return false;   // диапазон дат поверки
      if (dateTo && d > dateTo) return false;
      return true;
    });
    if (!awaiting.length) throw badRequest('Нет сертификатов в ожидании за выбранный период');
    // Оплачиваем указанное число (первые N ожидающих) или все, если не задано.
    const count = wantCount ? Math.min(wantCount, awaiting.length) : awaiting.length;
    const targets = awaiting.slice(0, count);
    // «Долг» каждого сертификата: свежий (В ожидании) — по введённой цене; уже
    // частично оплаченный («Есть остаток») — по своему остатку (amount − paidAmount).
    const dueOf = (c: CertRow) => {
      const amt = round2(c.amount); const paidC = round2(c.paidAmount);
      return amt > 0 ? round2(amt - paidC) : price;   // amt=0 → свежий, берём цену
    };
    const priceOf = (c: CertRow) => (round2(c.amount) > 0 ? round2(c.amount) : price);

    const incomeTotal = round2(targets.reduce((s, c) => s + dueOf(c), 0));   // итог к оплате (остаток по выбранным)
    const paid = round2(payments.reduce((s, p) => s + round2(p.amount), 0)); // сколько реально приняли
    if (paid <= 0) throw badRequest('Укажите принятую сумму');
    if (paid - incomeTotal > 0.01) throw badRequest(`Принято (${m2(paid)}) больше итога (${m2(incomeTotal)})`);

    return db.transaction(async (tx) => {
      // Пул принятых денег: закрываем сертификаты ПО ПОРЯДКУ. Полностью закрытый →
      // «Оплачено»; один недокрытый → «Есть остаток» (доход = внесённая часть);
      // остальные не трогаем (остаются «В ожидании»).
      const pool = payments.map(p => ({ accountId: String(p.accountId), left: round2(p.amount) }));
      let pi = 0; let closed = 0; let partialId: string | null = null;
      for (const c of targets) {
        const due = dueOf(c);
        if (due <= 0.005) continue;
        // сколько можем внести в этот серт из пула
        let take = 0; const alloc: PayLine[] = [];
        let need = due;
        while (need > 0.001 && pi < pool.length) {
          const t = round2(Math.min(need, pool[pi].left));
          if (t > 0) { alloc.push({ accountId: pool[pi].accountId, amount: t }); pool[pi].left = round2(pool[pi].left - t); need = round2(need - t); take = round2(take + t); }
          if (pool[pi].left <= 0.001) pi++;
        }
        if (take <= 0.005) break;   // деньги кончились — остальные оставляем «В ожидании»
        const full = take + 0.005 >= due;
        const newPaid = round2(priceOf(c) === due ? take : round2(round2(c.paidAmount) + take)); // накопительно для «Есть остаток»
        const upd = await certsRepo.update(c.id, {
          amount: String(priceOf(c)),
          paidAmount: String(full ? priceOf(c) : newPaid),
          payStatus: full ? 'Оплачено' : 'Есть остаток',
        }, tx);
        await productsService.syncCertSeal({ id: upd.id, serialNo: upd.serialNo }, sealFor(upd), actor, tx);
        // Доход этого сертификата за эту оплату = внесённая часть (alloc), привязан к certId.
        const src = sectionForCertSource(upd.source) === 'branch' ? 'Филиал' : 'Поверка';
        for (const p of alloc) {
          const acc = await financeRepo.findAccount(p.accountId, tx);
          if (!acc) throw badRequest('Счёт оплаты не найден');
          await financeService.createOperation(
            { opType: 'Приход', accountId: p.accountId, amount: m2(p.amount), name: `${upd.docType === 'izv' ? 'Извещение' : 'Сертификат'} ${upd.source || ''}${upd.serialNo ? ' №' + upd.serialNo : ''}`.slice(0, 200), source: src, certId: upd.id, accountName: acc.name },
            actor?.id ?? null, tx,
          );
        }
        if (full) closed++; else { partialId = upd.id; break; }
      }
      return { ok: true, closed, partial: !!partialId, paid: m2(paid) };
    });
  },

  // Выплата комиссии клиенту за сертификаты ТЭЦ (наш долг перед клиентом).
  // Кнопка/блок живёт на экране ВДК, но комиссия считается по ТЭЦ-сертам.
  // Отмечает выбранные сертификаты commission_paid_at + один Расход на сумму.
  async payCommission(input: unknown, actor?: { id: string; name?: string } | null) {
    const { dateFrom, dateTo, perCert, accountId, count: wantCount } = commissionPaySchema.parse(input);
    const round2 = (n: unknown) => Math.round((Number(n) || 0) * 100) / 100;
    const per = round2(perCert);
    if (per <= 0) throw badRequest('Укажите комиссию за сертификат');
    if (!accountId) throw badRequest('Выберите счёт для выплаты комиссии');
    const isoDate = (d: unknown) => (d ? String(d).slice(0, 10) : '');
    // Комиссия — только ТЭЦ; берём сертификаты без отметки о выплате в периоде.
    const rows = await certsRepo.list({ source: 'ТЭЦ', archived: false, type: 'cert' });
    const pending = rows.filter(c => {
      if (c.commissionPaidAt) return false;
      const d = isoDate(c.checkDate);
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
      return true;
    });
    if (!pending.length) throw badRequest('Нет сертификатов ТЭЦ без выплаченной комиссии за период');
    const count = wantCount ? Math.min(wantCount, pending.length) : pending.length;
    const targets = pending.slice(0, count);
    const total = round2(per * count);
    return db.transaction(async (tx) => {
      const acc = await financeRepo.findAccount(accountId, tx);
      if (!acc) throw badRequest('Счёт для выплаты комиссии не найден');
      const op = await financeService.createOperation(
        { opType: 'Расход', accountId, amount: m2(total), name: `Комиссия клиенту (ТЭЦ) — ${count} серт.`.slice(0, 200), source: 'Расходы', expenseCat: 'Комиссия клиенту', accountName: acc.name },
        actor?.id ?? null, tx,
      );
      const when = op?.opDate ? new Date(op.opDate as unknown as string) : new Date();
      for (const c of targets) await certsRepo.update(c.id, { commissionPaidAt: when }, tx);
      return { ok: true, count, total: m2(total) };
    });
  },

  // Отметить комиссию выплаченной задним числом (без денег) — напр. прошлый месяц.
  async markCommissionPaid(input: unknown) {
    const { dateFrom, dateTo } = commissionPaySchema.pick({ dateFrom: true, dateTo: true }).parse(input);
    const isoDate = (d: unknown) => (d ? String(d).slice(0, 10) : '');
    const rows = await certsRepo.list({ source: 'ТЭЦ', archived: false, type: 'cert' });
    const targets = rows.filter(c => {
      if (c.commissionPaidAt) return false;
      const d = isoDate(c.checkDate);
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
      return true;
    });
    return db.transaction(async (tx) => {
      const when = new Date();
      for (const c of targets) await certsRepo.update(c.id, { commissionPaidAt: when }, tx);
      return { ok: true, count: targets.length };
    });
  },
};
