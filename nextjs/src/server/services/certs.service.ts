import { db } from '@/db';
import { certsRepo } from '@/server/repositories/certs.repo';
import { certUpsertSchema, certUpdateSchema, cleanCertFields, type CertQuery } from '@/server/dto/certs.dto';
import { deviceTypesService } from '@/server/services/deviceTypes.service';
import { productsService } from '@/server/services/products.service';
import { sealMarker } from '@/server/dto/products.dto';
import { badRequest, notFound } from '@/server/lib/errors';

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
    // Клеймо-расходник (СЛ/ПЛ) списывается только при создании ПОВЕРКИ.
    const marker = sealMarker(fields.docType as string | null, fields.sealType as string | null);
    // Сертификат + автосписание клейма — одной транзакцией (либо оба, либо ничего).
    const row = await db.transaction(async (tx) => {
      const created = await certsRepo.create(fields, tx);
      if (marker) await productsService.consumeSeal(marker, { id: created.id, serialNo: fields.serialNo as string | null }, actor, tx);
      return created;
    });
    // Самообучение справочника типов приборов (best-effort, не роняет сохранение).
    if (fields.meterType) await deviceTypesService.touch(fields.meterType);
    return row;
  },

  async update(id: string, input: unknown) {
    if (!id) throw badRequest('id is required');
    const data = certUpdateSchema.parse(input);
    const fields = cleanCertFields(data);
    // нельзя занулять NOT NULL поля — если пришёл null, пишем ''
    if ('fio' in fields && fields.fio == null) fields.fio = '';
    if ('address' in fields && fields.address == null) fields.address = '';
    const row = await certsRepo.update(id, fields);
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
