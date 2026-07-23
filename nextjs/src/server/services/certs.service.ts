import { db } from '@/db';
import { certsRepo } from '@/server/repositories/certs.repo';
import { certUpsertSchema, certUpdateSchema, cleanCertFields, isCertPaid, type CertQuery } from '@/server/dto/certs.dto';
import { deviceTypesService } from '@/server/services/deviceTypes.service';
import { productsService } from '@/server/services/products.service';
import { sealMarker } from '@/server/dto/products.dto';
import { badRequest, notFound } from '@/server/lib/errors';

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
      type: q.type || 'cert',
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
};
