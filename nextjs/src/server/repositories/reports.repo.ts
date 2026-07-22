import { db } from '@/db';
import { sql } from 'drizzle-orm';

// Нормализация результата db.execute (neon-serverless возвращает {rows} или массив).
function rowsOf<T = Record<string, unknown>>(res: unknown): T[] {
  const r = res as { rows?: unknown[] };
  if (Array.isArray(r?.rows)) return r.rows as T[];
  return Array.isArray(res) ? (res as T[]) : [];
}

// ВСЕ агрегаты считаются на сервере (group by), клиенту уходит только сводка.
export const reportsRepo = {
  activeUsers: async () =>
    rowsOf<{ id: string; name: string; role: string }>(await db.execute(sql`select id, name, role from users where is_active = true order by name`)),

  // Продажи по автору (created_by), без отменённых, по дате продажи.
  salesByUser: async (from: string, to: string) =>
    rowsOf<{ uid: string; cnt: number; sum: string }>(await db.execute(sql`
      select created_by as "uid", count(*)::int as "cnt", coalesce(sum(total_sum),0)::numeric as "sum"
      from sales where cancelled_at is null and created_by is not null and sale_date between ${from} and ${to}
      group by created_by`)),

  // Сертификаты по автору и источнику (шт), только cert, по дате создания.
  certsByUser: async (from: string, to: string) =>
    rowsOf<{ uid: string; source: string; cnt: number }>(await db.execute(sql`
      select created_by as "uid", source, count(*)::int as "cnt"
      from certificates where doc_type='cert' and created_by is not null and created_at::date between ${from} and ${to}
      group by created_by, source`)),

  // Задачи выполнено — по исполнителю (assignee) и дате завершения.
  tasksByUser: async (from: string, to: string) =>
    rowsOf<{ uid: string; cnt: number }>(await db.execute(sql`
      select assignee_id as "uid", count(*)::int as "cnt"
      from tasks where status='done' and assignee_id is not null and completed_at::date between ${from} and ${to}
      group by assignee_id`)),

  // Расходы внесено — сумма по автору (finance Расход, без сторно), по дате операции.
  expensesByUser: async (from: string, to: string) =>
    rowsOf<{ uid: string; sum: string }>(await db.execute(sql`
      select created_by as "uid", coalesce(sum(amount),0)::numeric as "sum"
      from finance_operations where op_type='Расход' and reverses is null and created_by is not null and op_date between ${from} and ${to}
      group by created_by`)),

  // Заявки — из audit_log (у orders нет автора): действия по заявкам за период.
  ordersByUser: async (from: string, to: string) =>
    rowsOf<{ uid: string; cnt: number }>(await db.execute(sql`
      select user_id as "uid", count(*)::int as "cnt"
      from audit_log where entity_type='order' and user_id is not null and created_at::date between ${from} and ${to}
      group by user_id`)),

  // Всего действий из журнала аудита.
  actionsByUser: async (from: string, to: string) =>
    rowsOf<{ uid: string; cnt: number }>(await db.execute(sql`
      select user_id as "uid", count(*)::int as "cnt"
      from audit_log where user_id is not null and created_at::date between ${from} and ${to}
      group by user_id`)),

  // Динамика по дням.
  salesDaily: async (from: string, to: string) =>
    rowsOf<{ day: string; sum: string }>(await db.execute(sql`
      select sale_date::text as "day", coalesce(sum(total_sum),0)::numeric as "sum"
      from sales where cancelled_at is null and sale_date between ${from} and ${to}
      group by sale_date order by sale_date`)),
  certsDaily: async (from: string, to: string) =>
    rowsOf<{ day: string; cnt: number }>(await db.execute(sql`
      select created_at::date::text as "day", count(*)::int as "cnt"
      from certificates where doc_type='cert' and created_at::date between ${from} and ${to}
      group by created_at::date order by 1`)),

  // Детализация действий сотрудника (лента для раскрытия строки).
  employeeActivity: async (userId: string, from: string, to: string) =>
    rowsOf<{ action: string; entityType: string; entityLabel: string; details: unknown; createdAt: string }>(await db.execute(sql`
      select action, entity_type "entityType", entity_label "entityLabel", details, created_at "createdAt"
      from audit_log where user_id=${userId} and created_at::date between ${from} and ${to}
      order by created_at desc limit 300`)),
};
