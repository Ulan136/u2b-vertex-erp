import { db } from '@/db';
import { deviceTypes, deviceTypeAliases, certificates } from '@/db/schema';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { normKey, deviceTypeMoveNames } from '@/server/dto/deviceTypes.dto';

type DeviceType = typeof deviceTypes.$inferSelect;

export const deviceTypesRepo = {
  // Полный список (для экрана управления) — по убыванию usage_count.
  list(): Promise<DeviceType[]> {
    return db.select().from(deviceTypes).orderBy(desc(deviceTypes.usageCount), deviceTypes.name);
  },

  // Автоподсказка: подстрочный поиск по нормализованному имени ИЛИ алиасу,
  // сортировка по usage_count desc, максимум `limit`.
  search(qNorm: string, limit = 10): Promise<DeviceType[]> {
    const like = `%${qNorm}%`;
    return db.select().from(deviceTypes)
      .where(sql`${deviceTypes.norm} like ${like} or exists (
        select 1 from ${deviceTypeAliases} a
        where a.device_type_id = ${deviceTypes.id} and a.norm like ${like})`)
      .orderBy(desc(deviceTypes.usageCount), deviceTypes.name)
      .limit(limit);
  },

  byId(id: string) {
    return db.select().from(deviceTypes).where(eq(deviceTypes.id, id)).then(r => r[0] ?? null);
  },

  byNorm(norm: string) {
    return db.select().from(deviceTypes).where(eq(deviceTypes.norm, norm)).then(r => r[0] ?? null);
  },

  // Поиск типа по алиасу (нормализованному) → сам тип.
  aliasByNorm(norm: string) {
    return db.select({ deviceTypeId: deviceTypeAliases.deviceTypeId }).from(deviceTypeAliases)
      .where(eq(deviceTypeAliases.norm, norm)).then(r => r[0] ?? null);
  },

  aliasesFor(deviceTypeId: string) {
    return db.select().from(deviceTypeAliases).where(eq(deviceTypeAliases.deviceTypeId, deviceTypeId));
  },

  create(name: string, norm: string, usageCount = 0) {
    return db.insert(deviceTypes)
      .values({ name, norm, usageCount, lastUsedAt: usageCount > 0 ? new Date() : null })
      .returning().then(r => r[0]);
  },

  rename(id: string, name: string, norm: string) {
    return db.update(deviceTypes).set({ name, norm }).where(eq(deviceTypes.id, id)).returning().then(r => r[0] ?? null);
  },

  // usage_count += 1 и last_used_at = now (самообучение при сохранении).
  bump(id: string) {
    return db.update(deviceTypes)
      .set({ usageCount: sql`${deviceTypes.usageCount} + 1`, lastUsedAt: new Date() })
      .where(eq(deviceTypes.id, id)).returning().then(r => r[0] ?? null);
  },

  addAlias(deviceTypeId: string, alias: string, norm: string) {
    return db.insert(deviceTypeAliases).values({ deviceTypeId, alias, norm }).returning().then(r => r[0]);
  },

  remove(id: string) {
    return db.delete(deviceTypes).where(eq(deviceTypes.id, id));
  },

  // Число сертификатов/извещений, использующих данный набор написаний (norm).
  async usageInCerts(norms: string[]): Promise<{ names: string[]; count: number }> {
    const rows = await db.select({ mt: certificates.meterType }).from(certificates)
      .where(sql`${certificates.meterType} is not null and ${certificates.meterType} <> ''`);
    const set = new Set(norms);
    const names = new Set<string>();
    for (const r of rows) if (r.mt && set.has(normKey(r.mt))) names.add(r.mt);
    return { names: Array.from(names), count: names.size };
  },

  // Транзакция слияния: перенос записей сертификатов, перенос алиасов,
  // суммирование счётчиков, удаление исходного типа.
  async merge(fromId: string, toId: string) {
    return db.transaction(async (tx) => {
      const [from] = await tx.select().from(deviceTypes).where(eq(deviceTypes.id, fromId));
      const [to] = await tx.select().from(deviceTypes).where(eq(deviceTypes.id, toId));
      if (!from || !to) throw new Error('device type not found');

      // Все написания исходного типа: его имя + его алиасы.
      const fromAliases = await tx.select().from(deviceTypeAliases).where(eq(deviceTypeAliases.deviceTypeId, fromId));
      const fromNorms = new Set<string>([from.norm, ...fromAliases.map(a => a.norm)]);

      // Перенести сертификаты/извещения, чей meterType соответствует любому написанию → на имя целевого типа.
      const certRows = await tx.select({ mt: certificates.meterType }).from(certificates)
        .where(sql`${certificates.meterType} is not null and ${certificates.meterType} <> ''`);
      const moveNames = deviceTypeMoveNames(Array.from(fromNorms), certRows.map(r => r.mt));
      let moved = 0;
      if (moveNames.length) {
        const res = await tx.update(certificates).set({ meterType: to.name })
          .where(inArray(certificates.meterType, moveNames)).returning({ id: certificates.id });
        moved = res.length;
      }

      // Перенести алиасы исходного типа на целевой + сохранить имя исходного как алиас.
      for (const a of fromAliases) {
        if (a.norm !== to.norm) await tx.update(deviceTypeAliases).set({ deviceTypeId: toId }).where(eq(deviceTypeAliases.id, a.id));
        else await tx.delete(deviceTypeAliases).where(eq(deviceTypeAliases.id, a.id));
      }
      if (from.norm !== to.norm) {
        const [exists] = await tx.select().from(deviceTypeAliases)
          .where(and(eq(deviceTypeAliases.deviceTypeId, toId), eq(deviceTypeAliases.norm, from.norm)));
        if (!exists) await tx.insert(deviceTypeAliases).values({ deviceTypeId: toId, alias: from.name, norm: from.norm });
      }

      // Суммировать счётчики и удалить исходный тип.
      const [merged] = await tx.update(deviceTypes)
        .set({ usageCount: to.usageCount + from.usageCount, lastUsedAt: new Date() })
        .where(eq(deviceTypes.id, toId)).returning();
      await tx.delete(deviceTypes).where(eq(deviceTypes.id, fromId));

      return { merged, moved, from: from.name, to: to.name };
    });
  },
};
