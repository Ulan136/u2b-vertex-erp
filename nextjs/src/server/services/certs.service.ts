import { certsRepo } from '@/server/repositories/certs.repo';
import { certUpsertSchema, certUpdateSchema, cleanCertFields, type CertQuery } from '@/server/dto/certs.dto';
import { deviceTypesService } from '@/server/services/deviceTypes.service';
import { badRequest, notFound } from '@/server/lib/errors';

export const certsService = {
  list(q: CertQuery) {
    return certsRepo.list({
      source: q.source ?? null,
      archived: q.archived ?? false,
      type: q.type || 'cert',
    });
  },

  async create(input: unknown) {
    const data = certUpsertSchema.parse(input);
    const fields = cleanCertFields(data);
    // fio/address — NOT NULL в БД без дефолта: гарантируем непустую строку (иначе 500).
    fields.fio ??= '';
    fields.address ??= '';
    const row = await certsRepo.create(fields);
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
    await certsRepo.remove(id);
    return { ok: true };
  },
};
