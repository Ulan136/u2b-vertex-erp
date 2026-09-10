import { orgRepo } from '@/server/repositories/org.repo';

const FIELDS = ['companyName', 'companyFull', 'bin', 'address', 'phone', 'directorName', 'banks', 'logoB64', 'stampB64', 'signB64', 'yandexMapsKey', 'stampSeqNext'] as const;

export const orgService = {
  get: () => orgRepo.get(),
  update(input: unknown) {
    const d = (input ?? {}) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    for (const k of FIELDS) if (d[k] !== undefined) {
      // stampSeqNext — целое число (порядковый № клейма); пустое → null.
      patch[k] = k === 'stampSeqNext' ? (Number(d[k]) > 0 ? Math.floor(Number(d[k])) : null) : d[k];
    }
    return orgRepo.upsert(patch);
  },
};
