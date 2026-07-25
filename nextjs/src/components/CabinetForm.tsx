'use client';

import { useState, useEffect, useCallback } from 'react';

const BRAND = '#1d4ed8';

type Position = { address: string; qty: number | string; water: string };
const emptyPos = (): Position => ({ address: '', qty: 1, water: 'Холодная' });

export type OrderSource = 'field_check' | 'tec';

// Заявка, созданная с этого устройства (храним секрет edit_token в localStorage,
// чтобы клиент мог менять СВОЮ заявку без входа).
type MyOrder = { id: string; orderNo: string; token: string };
type MyRow = { o: MyOrder; status: string; edited: boolean };

const LS_KEY = (source: OrderSource) => `cabinet_orders_${source}`;
const loadMine = (source: OrderSource): MyOrder[] => {
  if (typeof window === 'undefined') return [];
  try { const a = JSON.parse(localStorage.getItem(LS_KEY(source)) || '[]'); return Array.isArray(a) ? a : []; } catch { return []; }
};
const saveMine = (source: OrderSource, list: MyOrder[]) => {
  try { localStorage.setItem(LS_KEY(source), JSON.stringify(list.slice(0, 20))); } catch { /* приватный режим */ }
};

// Shared client-cabinet order form. The only thing that differs between the
// public cabinet (/cabinet) and the ТЭЦ cabinet (/cabinet/tec) is `source`.
// Кто создал заявку с этого устройства — тот может её и изменить (позиции целиком),
// пока логист не выполнил («Готова»); правка подсвечивается у мастера.
export default function CabinetForm({ source }: { source: OrderSource }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [comment, setComment] = useState('');
  const [positions, setPositions] = useState<Position[]>([emptyPos()]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editing, setEditing] = useState<MyOrder | null>(null);   // правим существующую заявку
  const [mine, setMine] = useState<MyRow[]>([]);

  const setPos = (i: number, k: keyof Position, v: string) =>
    setPositions(positions.map((p, idx) => (idx === i ? { ...p, [k]: v } : p)));
  const addPos = () => setPositions([...positions, emptyPos()]);
  const removePos = (i: number) => setPositions(positions.length > 1 ? positions.filter((_, idx) => idx !== i) : positions);

  // Подтянуть «мои заявки» и их актуальный статус (по токену).
  const refreshMine = useCallback(async () => {
    const saved = loadMine(source);
    const rows = await Promise.all(saved.map(async (o) => {
      try {
        const r = await fetch(`/api/v2/orders/${o.id}/cabinet?token=${encodeURIComponent(o.token)}`, { cache: 'no-store' });
        if (!r.ok) return null;
        const d = await r.json();
        const edited = !!d.editedAt && (!d.editedSeenAt || new Date(d.editedSeenAt).getTime() < new Date(d.editedAt).getTime());
        return { o: { ...o, orderNo: d.orderNo || o.orderNo }, status: d.status || 'В работе', edited } as MyRow;
      } catch { return null; }
    }));
    setMine(rows.filter((x): x is MyRow => !!x));
  }, [source]);

  useEffect(() => { refreshMine(); }, [refreshMine]);

  function resetForm() { setName(''); setPhone(''); setComment(''); setPositions([emptyPos()]); setEditing(null); }

  // Загрузить заявку в форму для правки.
  async function startEdit(mo: MyOrder) {
    setError(''); setSuccess('');
    try {
      const r = await fetch(`/api/v2/orders/${mo.id}/cabinet?token=${encodeURIComponent(mo.token)}`, { cache: 'no-store' });
      if (!r.ok) throw new Error('Не удалось загрузить заявку');
      const d = await r.json();
      if (d.status === 'Готова' || d.status === 'Отменён') { setError('Заявка уже выполнена — изменить нельзя'); await refreshMine(); return; }
      setName(d.clientName || ''); setPhone(d.phone || ''); setComment(d.comment || '');
      const pos: Position[] = Array.isArray(d.positions) && d.positions.length
        ? d.positions.map((p: Position) => ({ address: p.address, qty: p.qty, water: p.water }))
        : [emptyPos()];
      setPositions(pos);
      setEditing({ id: mo.id, orderNo: d.orderNo || mo.orderNo, token: mo.token });
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) { setError(e instanceof Error ? e.message : 'Ошибка загрузки'); }
  }

  async function submit() {
    const pos = positions
      .filter(p => String(p.address).trim())
      .map(p => ({ address: String(p.address).trim(), qty: Number(p.qty) || 1, water: p.water }));
    if (!pos.length) { setError('Добавьте хотя бы одну позицию с адресом'); return; }
    if (!phone.trim()) { setError('Укажите телефон'); return; }
    setError(''); setSuccess(''); setSending(true);
    try {
      if (editing) {
        // Правка своей заявки (по токену).
        const res = await fetch(`/api/v2/orders/${editing.id}/cabinet`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: editing.token, clientName: name.trim() || null, phone: phone.trim(), comment: comment.trim() || null, positions: pos }),
        });
        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'HTTP ' + res.status); }
        setSuccess(`✅ Заявка ${editing.orderNo} обновлена — мастер увидит изменения`);
        resetForm();
      } else {
        const res = await fetch('/api/v2/orders', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source, clientName: name.trim() || null, phone: phone.trim(), comment: comment.trim() || null,
            status: 'В работе', positions: pos, address: pos[0].address,
            qty: pos.reduce((s, p) => s + p.qty, 0), waterType: pos[0].water,
            orderDate: new Date().toISOString().slice(0, 10),
          }),
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const order = await res.json();
        if (order?.id && order?.editToken) saveMine(source, [{ id: order.id, orderNo: order.orderNo || '', token: order.editToken }, ...loadMine(source)]);
        setSuccess(`✅ Заявка принята! Номер: ${order.orderNo || ''}`);
        resetForm();
      }
      await refreshMine();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка отправки');
    }
    setSending(false);
  }

  const input: React.CSSProperties = { width: '100%', padding: '11px 12px', fontSize: 15, border: '1px solid #d1d5db', borderRadius: 10, outline: 'none', background: '#fff', color: '#111', boxSizing: 'border-box' };
  const label: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5, display: 'block' };
  const field: React.CSSProperties = { marginBottom: 14 };
  const statusColor = (s: string) => s === 'Готова' ? '#059669' : s === 'Отменён' ? '#dc2626' : '#1d4ed8';
  const statusText = (s: string) => s === 'Готова' ? '✅ Выполнена' : s === 'Отменён' ? '❌ Отменена' : '🔄 В работе';

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f7', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '20px 14px', fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <div style={{ width: '100%', maxWidth: 480 }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 34 }}>💧</div>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 1, color: '#111' }}>VERTEX METROLOGY</div>
          <div style={{ fontSize: 13, color: '#6b7280' }}>Заявка на поверку счётчиков воды</div>
        </div>

        {/* Мои заявки (с этого устройства) — можно изменить, пока не выполнена */}
        {mine.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 4px 24px rgba(0,0,0,.06)', marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 10 }}>🗂 Мои заявки</div>
            {mine.map(({ o, status, edited }) => (
              <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderTop: '1px solid #f3f4f6' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#111' }}>{o.orderNo || 'Заявка'}</div>
                  <div style={{ fontSize: 12, color: statusColor(status) }}>{statusText(status)}{edited ? ' · ✏️ изменения отправлены' : ''}</div>
                </div>
                {status !== 'Готова' && status !== 'Отменён' && (
                  <button onClick={() => startEdit(o)} style={{ background: '#eef2ff', color: BRAND, border: 'none', borderRadius: 9, padding: '8px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>✏️ Изменить</button>
                )}
              </div>
            ))}
          </div>
        )}

        {success && (
          <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 12, padding: 14, textAlign: 'center', color: '#059669', fontWeight: 700, fontSize: 15, marginBottom: 16 }}>
            {success}
          </div>
        )}

        {/* Форма (создание или правка) */}
        <div style={{ background: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 4px 24px rgba(0,0,0,.06)' }}>
          {editing && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '9px 12px', marginBottom: 14 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#92400e' }}>✏️ Изменение заявки {editing.orderNo}</span>
              <button onClick={resetForm} style={{ background: 'none', border: 'none', color: '#92400e', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Отмена</button>
            </div>
          )}
          <div style={field}>
            <label style={label}>Ваше имя</label>
            <input style={input} value={name} onChange={e => setName(e.target.value)} placeholder="ФИО или название организации" />
          </div>
          <div style={field}>
            <label style={label}>Телефон *</label>
            <input style={input} type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+7 700 000 00 00" />
          </div>

          <label style={label}>Позиции (адрес · кол-во · тип воды)</label>
          {positions.map((p, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center' }}>
              <input style={{ ...input, flex: 3 }} value={p.address} onChange={e => setPos(i, 'address', e.target.value)} placeholder="Адрес" />
              <input style={{ ...input, flex: 1, minWidth: 54 }} type="number" min={1} value={p.qty} onChange={e => setPos(i, 'qty', e.target.value)} />
              <select style={{ ...input, flex: 2, minWidth: 96 }} value={p.water} onChange={e => setPos(i, 'water', e.target.value)}>
                <option>Холодная</option>
                <option>Горячая</option>
              </select>
              <button onClick={() => removePos(i)} disabled={positions.length <= 1} style={{ background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: 8, width: 36, height: 36, fontSize: 15, cursor: positions.length <= 1 ? 'default' : 'pointer', opacity: positions.length <= 1 ? 0.4 : 1, flexShrink: 0 }}>✕</button>
            </div>
          ))}
          <button onClick={addPos} style={{ background: '#eef2ff', color: BRAND, border: 'none', borderRadius: 9, padding: '9px 13px', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginBottom: 14 }}>➕ Добавить позицию</button>

          <div style={field}>
            <label style={label}>Комментарий</label>
            <textarea style={{ ...input, minHeight: 64, resize: 'vertical', fontFamily: 'inherit' }} value={comment} onChange={e => setComment(e.target.value)} placeholder="Удобное время, доступ к объекту и т.д." />
          </div>

          {error && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 12, textAlign: 'center' }}>⚠️ {error}</div>}

          <button
            onClick={submit}
            disabled={sending}
            style={{ width: '100%', background: sending ? '#93a4d6' : BRAND, color: '#fff', border: 'none', borderRadius: 12, padding: 15, fontSize: 17, fontWeight: 700, cursor: sending ? 'default' : 'pointer' }}
          >
            {sending ? (editing ? 'Сохранение…' : 'Отправка…') : (editing ? '💾 Сохранить изменения' : '📤 Отправить заявку')}
          </button>
        </div>

        <div style={{ textAlign: 'center', fontSize: 11, color: '#9ca3af', marginTop: 16 }}>ТОО «VERTEX METROLOGY» · Поверка приборов учёта воды</div>
      </div>
    </div>
  );
}
