import { ordersRepo } from '@/server/repositories/orders.repo';
import { usersRepo } from '@/server/repositories/users.repo';
import { branchesRepo } from '@/server/repositories/branches.repo';
import { notificationsService } from '@/server/services/notifications.service';
import { randomUUID } from 'crypto';
import {
  orderCreateSchema, orderUpdateSchema, orderCabinetEditSchema, isOrderContentEdit, canCabinetEdit,
  filterOrdersBySource, externalCabinetUrl, scopeOrdersByBranch,
  type OrderSource,
} from '@/server/dto/orders.dto';
import { orderRecipients } from '@/server/dto/notifications.dto';
import type { SessionUser } from '@/server/lib/session';
import { badRequest, notFound } from '@/server/lib/errors';

// Base cabinet URL: an explicit env override, else the serving origin (which is
// the canonical host — the legacy domain 308-redirects to it), else a safe default.
const fieldCabinetUrl = (origin?: string | null) =>
  process.env.EXTERNAL_CABINET_URL ||
  `${(origin || 'https://u2b-vertex-erp.vercel.app').replace(/\/+$/, '')}/cabinet`;

function asSource(v: string | null | undefined): OrderSource | null {
  return v === 'field_check' || v === 'tec' ? v : null;
}

export const ordersService = {
  // No source → all orders (back-compat); source → only that stream.
  // Заявки разделяются по филиалу: Админ/Директор видят все (или branchFilter),
  // остальные — только свой филиал; заявки без филиала считаются головным.
  async list(source?: string | null, actor?: SessionUser | null, branchFilter?: string | null) {
    const rows = await ordersRepo.list();
    const headBranchId = await branchesRepo.headId();
    const isPriv = actor?.role === 'admin' || actor?.role === 'director';
    const userBranchId = actor && !isPriv ? await usersRepo.branchOf(actor.id) : null;
    const scoped = scopeOrdersByBranch(rows, { role: actor?.role, userBranchId, headBranchId, branchFilter });
    const s = asSource(source);
    return s ? filterOrdersBySource(scoped, s) : scoped;
  },

  async create(input: unknown, actor?: SessionUser | null) {
    const data = orderCreateSchema.parse(input);
    if (!data.orderNo) {
      data.orderNo = await ordersRepo.nextOrderNo(data.source);   // номер из секвенса БД
    }
    // филиал: из ERP — филиал создателя, из внешнего кабинета — головной (Алматы)
    if (data.branchId == null) {
      const fromUser = actor ? await usersRepo.branchOf(actor.id) : null;
      data.branchId = fromUser ?? await branchesRepo.headId();
    }
    // Автор = пользователь сессии (из ERP). Внешний кабинет без сессии → null.
    // editToken — секрет правки: возвращается создателю, чтобы он мог менять свою
    // заявку из кабинета без входа (пока она не «Готова»).
    const order = await ordersRepo.create({ ...data, createdBy: actor?.id ?? null, editToken: randomUUID() });
    // notify managers + admins about the new cabinet order (best-effort)
    try {
      const users = await usersRepo.listActiveLite();
      const isTec = order.source === 'tec';
      await notificationsService.create(orderRecipients(users), {
        type: 'order',
        title: `Новая заявка ${order.orderNo ?? ''} (${isTec ? 'ТЭЦ' : 'Выездная'})`,
        link: isTec ? 'tec-orders' : 'field-orders',
      });
    } catch { /* notifications are best-effort */ }
    return order;
  },

  // Правку СОДЕРЖИМОГО (адрес/кол-во/телефон/позиции/комментарий) метим для
  // логиста: создатель может менять заявку, пока она «не доставлена» (не «Готова»).
  // Смена только статуса/фото изменением не считается.
  async update(id: string, input: unknown, actor?: SessionUser | null) {
    if (!id) throw badRequest('id is required');
    const data = orderUpdateSchema.parse(input);
    const patch: Record<string, unknown> = { ...data };
    if (isOrderContentEdit(data)) {
      const existing = await ordersRepo.findById(id);
      if (!existing) throw notFound('Order not found');
      const privileged = actor?.role === 'admin' || actor?.role === 'director';
      if (existing.status === 'Готова' && !privileged) {
        throw badRequest('Заявка уже выполнена логистом — правка недоступна');
      }
      // Отметить изменение и сбросить «просмотрено» — логист увидит другим фоном.
      patch.editedAt = new Date();
      patch.editedBy = actor?.id ?? null;
      patch.editedSeenAt = null;
    }
    const row = await ordersRepo.update(id, patch);
    if (!row) throw notFound('Order not found');
    return row;
  },

  // Логист открыл изменённую заявку → отметка «изменено» снимается (не «принять»,
  // просто «увидел»). Ставим edited_seen_at = сейчас (≥ edited_at).
  async markEditedSeen(id: string) {
    if (!id) throw badRequest('id is required');
    const row = await ordersRepo.update(id, { editedSeenAt: new Date() });
    if (!row) throw notFound('Order not found');
    return row;
  },

  // ── Кабинет (клиент без входа, доступ по секрету edit_token) ──
  // Заявка по id+токену: для показа «моих заявок» и загрузки в форму правки.
  async cabinetGet(id: string, token: string | null) {
    if (!id || !token) throw notFound('Заявка не найдена');
    const o = await ordersRepo.findById(id);
    if (!o || !o.editToken || o.editToken !== token) throw notFound('Заявка не найдена');
    // отдаём только нужное кабинету (без служебных/чужих полей)
    return { id: o.id, orderNo: o.orderNo, status: o.status, source: o.source,
      clientName: o.clientName, phone: o.phone, comment: o.comment, positions: o.positions,
      editedAt: o.editedAt, editedSeenAt: o.editedSeenAt };
  },

  // Правка заявки из кабинета: только с верным токеном и пока «не доставлена».
  // Помечает изменение для логиста (edited_at, сброс «просмотрено»).
  async cabinetUpdate(id: string, token: string | null, input: unknown) {
    if (!id || !token) throw notFound('Заявка не найдена');
    const o = await ordersRepo.findById(id);
    if (!o || !o.editToken || o.editToken !== token) throw notFound('Заявка не найдена');
    if (!canCabinetEdit(o, token)) throw badRequest('Заявка уже выполнена — правка недоступна');
    const data = orderCabinetEditSchema.parse(input);
    const positions = data.positions.filter(p => String(p.address).trim());
    if (!positions.length) throw badRequest('Нужна хотя бы одна позиция с адресом');
    const row = await ordersRepo.update(id, {
      clientName: data.clientName?.trim() || null,
      phone: data.phone?.trim() || o.phone,
      comment: data.comment?.trim() || null,
      positions,
      address: positions[0].address,
      qty: positions.reduce((s, p) => s + (Number(p.qty) || 1), 0),
      waterType: positions[0].water,
      editedAt: new Date(), editedBy: null, editedSeenAt: null,
    });
    if (!row) throw notFound('Заявка не найдена');
    return { id: row.id, orderNo: row.orderNo, status: row.status };
  },

  async remove(id: string) {
    if (!id) throw badRequest('id is required');
    await ordersRepo.remove(id);
    return { ok: true };
  },

  externalUrl: (source?: string | null, origin?: string | null) => ({
    url: externalCabinetUrl(fieldCabinetUrl(origin), asSource(source) ?? 'field_check'),
  }),
};
