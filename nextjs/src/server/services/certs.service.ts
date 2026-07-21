import { certsRepo } from '@/server/repositories/certs.repo';
import { certUpsertSchema, certUpdateSchema, cleanCertFields, type CertQuery } from '@/server/dto/certs.dto';
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
    return certsRepo.create(cleanCertFields(data));
  },

  async update(id: string, input: unknown) {
    if (!id) throw badRequest('id is required');
    const data = certUpdateSchema.parse(input);
    const row = await certsRepo.update(id, cleanCertFields(data));
    if (!row) throw notFound('Certificate not found');
    return row;
  },

  async remove(id: string) {
    if (!id) throw badRequest('id is required');
    await certsRepo.remove(id);
    return { ok: true };
  },
};
