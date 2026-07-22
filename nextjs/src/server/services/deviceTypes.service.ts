import { deviceTypesRepo } from '@/server/repositories/deviceTypes.repo';
import { normDisplay, normKey } from '@/server/dto/deviceTypes.dto';
import { badRequest, notFound, conflict } from '@/server/lib/errors';

export const deviceTypesService = {
  list() {
    return deviceTypesRepo.list();
  },

  // Автоподсказка (≥1 символ). Пусто → ничего (в модалке ждём ввод).
  async search(q: string, limit = 10) {
    const key = normKey(q);
    if (!key) return [];
    return deviceTypesRepo.search(key, limit);
  },

  // Разрешить значение в тип: сперва по алиасу, потом по имени. null — нет совпадения.
  async resolve(value: string) {
    const key = normKey(value);
    if (!key) return null;
    const alias = await deviceTypesRepo.aliasByNorm(key);
    if (alias) return deviceTypesRepo.byId(alias.deviceTypeId);
    return deviceTypesRepo.byNorm(key);
  },

  // САМООБУЧЕНИЕ: значение из сертификата/извещения/импорта.
  //   совпало (тип или алиас) → usage_count += 1, last_used_at = now;
  //   нет совпадения → создать новый тип (usage_count = 1), сразу доступен в подсказках.
  // Best-effort: ошибки не роняют сохранение документа.
  async touch(value: unknown) {
    try {
      const name = normDisplay(value);
      const key = normKey(name);
      if (!key) return null;
      const existing = await this.resolve(name);
      if (existing) return deviceTypesRepo.bump(existing.id);
      return deviceTypesRepo.create(name, key, 1);
    } catch (e) {
      console.warn('[deviceTypes.touch]', (e as Error).message);
      return null;
    }
  },

  // Управление (Админ/Менеджер) — создать вручную.
  async create(input: unknown) {
    const name = normDisplay((input as { name?: unknown })?.name);
    if (!name) throw badRequest('Укажите название типа');
    const key = normKey(name);
    if (await deviceTypesRepo.byNorm(key)) throw conflict('Такой тип уже есть');
    return deviceTypesRepo.create(name, key, 0);
  },

  async rename(id: string, input: unknown) {
    if (!id) throw badRequest('id обязателен');
    const name = normDisplay((input as { name?: unknown })?.name);
    if (!name) throw badRequest('Укажите название типа');
    const key = normKey(name);
    const cur = await deviceTypesRepo.byId(id);
    if (!cur) throw notFound('Тип не найден');
    const clash = await deviceTypesRepo.byNorm(key);
    if (clash && clash.id !== id) throw conflict('Такой тип уже есть — используйте объединение');
    // Старое написание сохраняем как алиас, чтобы прежние записи находились.
    if (cur.norm !== key) await deviceTypesRepo.addAlias(id, cur.name, cur.norm);
    return deviceTypesRepo.rename(id, name, key);
  },

  async merge(input: unknown) {
    const { fromId, toId } = (input as { fromId?: string; toId?: string }) || {};
    if (!fromId || !toId) throw badRequest('Нужны fromId и toId');
    if (fromId === toId) throw badRequest('Нельзя объединить тип сам с собой');
    const from = await deviceTypesRepo.byId(fromId);
    const to = await deviceTypesRepo.byId(toId);
    if (!from || !to) throw notFound('Тип не найден');
    return deviceTypesRepo.merge(fromId, toId);
  },

  async remove(id: string) {
    if (!id) throw badRequest('id обязателен');
    const cur = await deviceTypesRepo.byId(id);
    if (!cur) throw notFound('Тип не найден');
    const aliases = await deviceTypesRepo.aliasesFor(id);
    const norms = [cur.norm, ...aliases.map(a => a.norm)];
    const { count, names } = await deviceTypesRepo.usageInCerts(norms);
    if (count > 0) throw conflict(`Нельзя удалить: используется в ${count} записях (${names.slice(0, 3).join(', ')}${names.length > 3 ? '…' : ''}). Объедините с другим типом.`);
    await deviceTypesRepo.remove(id);
    return { ok: true };
  },
};
