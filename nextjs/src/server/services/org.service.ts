import { orgRepo } from '@/server/repositories/org.repo';

const FIELDS = ['companyName', 'companyFull', 'bin', 'address', 'phone', 'directorName', 'banks', 'logoB64', 'stampB64', 'signB64'] as const;

export const orgService = {
  get: () => orgRepo.get(),
  update(input: unknown) {
    const d = (input ?? {}) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    for (const k of FIELDS) if (d[k] !== undefined) patch[k] = d[k];
    return orgRepo.upsert(patch);
  },
};
