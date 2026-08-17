import { db, type Executor } from '@/db';
import { certsRepo } from '@/server/repositories/certs.repo';
import { certUpsertSchema, certUpdateSchema, cleanCertFields, isCertPaid, poverkaPaymentSchema, payByClientSchema, sectionForCertSource, certIncomePosts, type CertQuery } from '@/server/dto/certs.dto';
import { deviceTypesService } from '@/server/services/deviceTypes.service';
import { productsService } from '@/server/services/products.service';
import { financeService } from '@/server/services/finance.service';
import { financeRepo } from '@/server/repositories/finance.repo';
import { sealMarker } from '@/server/dto/products.dto';
import { badRequest, notFound } from '@/server/lib/errors';

const m2 = (n: unknown) => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);

// Какое клеймо должно быть списано у ИТОГОВОГО состояния поверки:
// расходуется только у ОПЛАЧЕННОЙ поверки (docType='cert'); иначе — ничего.
function sealFor(cert: { docType?: string | null; sealType?: string | null; payStatus?: string | null }): 'СЛ' | 'ПЛ' | null {
  return isCertPaid(cert.payStatus) ? sealMarker(cert.docType, cert.sealType) : null;
}

// ── Доход прямого сертификата/извещения (смешанная оплата → приход на счета) ──
type CertRow = { id: string; source?: string | null; payStatus?: string | null; amount?: unknown; docType?: string | null; serialNo?: string | null };
type PayLine = { accountId: string; amount: number };

// Сторнируем действующий доход сертификата (обратной операцией, баланс к нулю).
async function reverseCertIncome(certId: string, actor: { id: string; name?: string } | null | undefined, tx: Executor) {
  const ops = (await financeRepo.findByCert(certId, tx)).filter(o => o.opType === 'Приход' && !o.reversedAt && !o.reverses);
  for (const o of ops) await financeService.reverseOperation(o.id, actor?.id ?? null, tx);
  return ops.length;
}

// Раскладка дохода: явные строки оплаты или (пусто) весь доход на счёт раздела.
async function resolveCertAlloc(cert: CertRow, payments: PayLine[] | undefined, tx: Executor): Promise<PayLine[]> {
  const amount = Math.round((Number(cert.amount) || 0) * 100) / 100;
  let alloc = (payments || []).map(p => ({ accountId: String(p.accountId), amount: Math.round((Number(p.amount) || 0) * 100) / 100 })).filter(p => p.accountId && p.amount > 0);
  if (!alloc.length) {
    const acc = await financeRepo.defaultAccount(sectionForCertSource(cert.source), tx);
    if (!acc) throw badRequest('Нет счёта для дохода — заведите счёт в разделе (Финансы → Привязка счетов)');
    alloc = [{ accountId: acc.id, amount }];
  }
  const sum = alloc.reduce((s, p) => s + p.amount, 0);
  if (Math.abs(sum - amount) > 0.01) throw badRequest(`Сумма оплат (${m2(sum)}) должна равняться цене (${m2(amount)})`);
  return alloc;
}

// Идемпотентная сверка дохода: приводит доход сертификата к нужному состоянию
// (оплачено+не Выездная+цена>0 → приход по раскладке; иначе → сторно). Не трогает
// уже проведённый доход, если раскладка не изменилась (правка не-оплатных полей).
async function syncCertIncome(cert: CertRow, payments: PayLine[] | undefined, actor: { id: string; name?: string } | null | undefined, tx: Executor) {
  const existing = (await financeRepo.findByCert(cert.id, tx)).filter(o => o.opType === 'Приход' && !o.reversedAt && !o.reverses);
  if (!certIncomePosts(cert)) { if (existing.length) await reverseCertIncome(cert.id, actor, tx); return; }
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
  list(q: CertQuery) {
    return certsRepo.list({
      source: q.source ?? null,
      archived: q.archived ?? false,
      type: q.orderId ? null : (q.type || 'cert'),   // по заявке — все её сертификаты, без фильтра по типу
      orderId: q.orderId ?? null,
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
    const { source, docType, client, pricePerCert, payments, commission } = payByClientSchema.parse(input);
    if (source === 'Выездная') throw badRequest('Для Выездной оплата идёт через заявку мастера, не здесь');
    const round2 = (n: unknown) => Math.round((Number(n) || 0) * 100) / 100;
    const price = round2(pricePerCert);
    if (price <= 0) throw badRequest('Укажите цену за сертификат');

    const rows = await certsRepo.list({ source, archived: false, type: docType || 'cert' });
    const targets = rows.filter(c => (c.client || '') === client && !isCertPaid(c.payStatus));
    if (!targets.length) throw badRequest('У клиента нет сертификатов в ожидании оплаты');
    const count = targets.length;

    const incomeTotal = round2(price * count);
    const paid = payments.reduce((s, p) => s + round2(p.amount), 0);
    if (Math.abs(paid - incomeTotal) > 0.01) throw badRequest(`Сумма оплат (${m2(paid)}) должна равняться итогу (${m2(incomeTotal)})`);

    const commPer = commission ? round2(commission.perCert) : 0;
    const commTotal = round2(commPer * count);

    return db.transaction(async (tx) => {
      // Пул оплаты: раскидываем по сертификатам по порядку (каждому — его цену).
      const pool = payments.map(p => ({ accountId: String(p.accountId), left: round2(p.amount) }));
      let pi = 0;
      for (const c of targets) {
        const upd = await certsRepo.update(c.id, { amount: String(price), payStatus: 'Оплачено' }, tx);
        await productsService.syncCertSeal({ id: upd.id, serialNo: upd.serialNo }, sealFor(upd), actor, tx);
        // Раскладка дохода этого сертификата = его цена, набранная из пула счетов.
        let need = price;
        const alloc: PayLine[] = [];
        while (need > 0.001 && pi < pool.length) {
          const take = round2(Math.min(need, pool[pi].left));
          if (take > 0) { alloc.push({ accountId: pool[pi].accountId, amount: take }); pool[pi].left = round2(pool[pi].left - take); need = round2(need - take); }
          if (pool[pi].left <= 0.001) pi++;
        }
        await syncCertIncome(upd, alloc, actor, tx);
      }
      // Выплата комиссии клиенту — один Расход с выбранного счёта.
      if (commTotal > 0 && commission) {
        const acc = await financeRepo.findAccount(commission.accountId, tx);
        if (!acc) throw badRequest('Счёт для выплаты комиссии не найден');
        await financeService.createOperation(
          { opType: 'Расход', accountId: commission.accountId, amount: m2(commTotal), name: `Комиссия клиенту — ${client}`.slice(0, 200), source: 'Расходы', accountName: acc.name },
          actor?.id ?? null, tx,
        );
      }
      return { ok: true, count, incomeTotal: m2(incomeTotal), commissionTotal: m2(commTotal) };
    });
  },
};
