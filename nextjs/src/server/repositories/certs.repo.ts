import { db, type Executor } from '@/db';
import { certificates, users } from '@/db/schema';
import { and, desc, eq, getTableColumns, sql } from 'drizzle-orm';

type CertInsert = typeof certificates.$inferInsert;
type Source = typeof certificates.source.enumValues[number];

export const certsRepo = {
  list({ source, archived, type, orderId, branchId, trash }: { source?: string | null; archived: boolean; type?: string | null; orderId?: string | null; branchId?: string | null; trash?: boolean }) {
    // Корзина: trash=true → только удалённые (deleted_at IS NOT NULL); иначе — только
    // живые (deleted_at IS NULL). Удалённые никогда не смешиваются с обычными списками.
    const conds = [trash ? sql`${certificates.deletedAt} is not null` : sql`${certificates.deletedAt} is null`, eq(certificates.isArchived, archived)];
    if (type) conds.push(eq(certificates.docType, type));          // без type → все документы (для дашборда)
    if (source) conds.push(eq(certificates.source, source as Source));
    if (orderId) conds.push(eq(certificates.orderId, orderId));    // сертификаты одной заявки
    if (branchId) conds.push(eq(certificates.branchId, branchId)); // скоуп кабинета филиала
    // photos (base64) в списке НЕ отдаём — только их количество; сами фото по
    // ссылке /api/v2/certs/{id}/photo/{n}. Так списки лёгкие и без дублей.
    const { photos: _photos, ...cols } = getTableColumns(certificates);
    void _photos;
    // Реальные счета дохода сертификата (для колонки «Счёт»): имена счетов действующих
    // приходов по этому серту (прямые — по cert_id; Выездная — по order_id). Пусто = не
    // оплачен; 1 счёт = его имя; несколько = смешанная оплата.
    const payAccounts = sql<string[]>`coalesce((
      select array_agg(distinct fo.account_name) from finance_operations fo
      where fo.op_type = 'Приход' and fo.reversed_at is null and fo.reverses is null
        and fo.account_name is not null
        and (fo.cert_id = ${certificates.id}
             or (${certificates.orderId} is not null and fo.order_id = ${certificates.orderId}))
    ), '{}')`;
    return db.select({ ...cols, createdByName: users.name, photoCount: sql<number>`coalesce(jsonb_array_length(${certificates.photos}), 0)`, payAccounts }).from(certificates)
      .leftJoin(users, eq(certificates.createdBy, users.id))
      // Сортировка по ДАТЕ ПОВЕРКИ (новые сверху), при равной — по времени создания.
      // Так после правки даты серт встаёт на своё место, а не остаётся по порядку ввода.
      .where(and(...conds)).orderBy(sql`${certificates.checkDate} desc nulls last`, desc(certificates.createdAt));
  },

  async findById(id: string, exec: Executor = db) {
    const [row] = await exec.select().from(certificates).where(eq(certificates.id, id)).limit(1);
    return row ?? null;
  },

  async create(data: Record<string, unknown>, exec: Executor = db) {
    const [row] = await exec.insert(certificates).values(data as unknown as CertInsert).returning();
    return row;
  },

  async update(id: string, data: Record<string, unknown>, exec: Executor = db) {
    const [row] = await exec
      .update(certificates)
      .set({ ...(data as Partial<CertInsert>), updatedAt: new Date() })
      .where(eq(certificates.id, id))
      .returning();
    return row;
  },

  // Корзина: мягкое удаление (в корзину) и восстановление.
  softDelete: (id: string, exec: Executor = db) =>
    exec.update(certificates).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(certificates.id, id)),
  async restore(id: string, exec: Executor = db) {
    const [row] = await exec.update(certificates).set({ deletedAt: null, updatedAt: new Date() }).where(eq(certificates.id, id)).returning();
    return row ?? null;
  },

  remove: (id: string, exec: Executor = db) => exec.delete(certificates).where(eq(certificates.id, id)),
};
