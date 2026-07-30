import { db } from '@/db';
import { certsRepo } from '@/server/repositories/certs.repo';
import { certUpsertSchema, certUpdateSchema, cleanCertFields, isCertPaid, poverkaPaymentSchema, type CertQuery } from '@/server/dto/certs.dto';
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
    const fields = cleanCertFields(data);
    // fio/address — NOT NULL в БД без дефолта: гарантируем непустую строку (иначе 500).
    fields.fio ??= '';
    fields.address ??= '';
    // Автор сертификата — для аналитики по сотрудникам (раньше не сохранялся).
    if (actor?.id) fields.createdBy = actor.id;
    // Сертификат + списание клейма (только если поверка уже «Оплачено») — одной
    // транзакцией. Маркер считаем по сохранённой строке (итоговое состояние).
    const row = await db.transaction(async (tx) => {
      const created = await certsRepo.create(fields, tx);
      await productsService.syncCertSeal({ id: created.id, serialNo: created.serialNo }, sealFor(created), actor, tx);
      return created;
    });
    // Самообучение справочника типов приборов (best-effort, не роняет сохранение).
    if (fields.meterType) await deviceTypesService.touch(fields.meterType);
    return row;
  },

  async update(id: string, input: unknown, actor?: { id: string; name?: string } | null) {
    if (!id) throw badRequest('id is required');
    const data = certUpdateSchema.parse(input);
    const fields = cleanCertFields(data);
    // нельзя занулять NOT NULL поля — если пришёл null, пишем ''
    if ('fio' in fields && fields.fio == null) fields.fio = '';
    if ('address' in fields && fields.address == null) fields.address = '';
    // Правка + пересверка списания клейма (статус оплаты/тип клейма могли
    // измениться) — одной транзакцией. Оплатили → списываем; откатили в ожидание
    // → возвращаем; сменили СЛ/ПЛ → переставляем.
    const row = await db.transaction(async (tx) => {
      const updated = await certsRepo.update(id, fields, tx);
      if (!updated) return null;
      await productsService.syncCertSeal({ id: updated.id, serialNo: updated.serialNo }, sealFor(updated), actor, tx);
      return updated;
    });
    if (!row) throw notFound('Certificate not found');
    if ('meterType' in fields && fields.meterType) await deviceTypesService.touch(fields.meterType);
    return row;
  },

  async remove(id: string) {
    if (!id) throw badRequest('id is required');
    // Возвращаем списанные клейма на склад и удаляем поверку — одной транзакцией
    // (заодно снимаем ссылку cert_id с движений, иначе FK не даст удалить).
    await db.transaction(async (tx) => {
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
};
