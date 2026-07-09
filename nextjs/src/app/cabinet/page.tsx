'use client';

import { useEffect, useState } from 'react';

const BRAND = '#1d4ed8';
const STATUSES = ['В работе', 'Готова', 'Отменён'] as const;
const statusStyle: Record<string, { bg: string; fg: string; label: string }> = {
  'В работе': { bg: '#eff6ff', fg: '#1d4ed8', label: '🔄 В работе' },
  'Готова':   { bg: '#dcfce7', fg: '#059669', label: '✅ Готова' },
  'Отменён':  { bg: '#fee2e2', fg: '#dc2626', label: '❌ Отменён' },
};

type Position = { address: string; qty: number | string; water: string };
type Order = {
  id: string; orderNo?: string; orderDate?: string; clientName?: string;
  phone?: string; comment?: string; status: string;
  positions?: Position[]; address?: string; qty?: number; waterType?: string;
};

const emptyPosition = (): Position => ({ address: '', qty: 1, water: 'Холодная' });
const emptyForm = () => ({ name: '', phone: '', comment: '', status: 'В работе', positions: [emptyPosition()] });

export default function CabinetPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/orders', { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      setOrders(await res.json());
      setListError('');
    } catch (e) {
      setListError(e instanceof Error ? e.message : 'Ошибка загрузки');
    }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditingId(null); setForm(emptyForm()); setFormError(''); setModalOpen(true);
  }
  function openEdit(o: Order) {
    setEditingId(o.id);
    setForm({
      name: o.clientName || '', phone: o.phone || '', comment: o.comment || '',
      status: o.status || 'В работе',
      positions: (o.positions && o.positions.length ? o.positions : [{ address: o.address || '', qty: o.qty || 1, water: o.waterType || 'Холодная' }]),
    });
    setFormError(''); setModalOpen(true);
  }

  const setPos = (i: number, k: keyof Position, v: string) => {
    const positions = form.positions.map((p, idx) => idx === i ? { ...p, [k]: v } : p);
    setForm({ ...form, positions });
  };
  const addPos = () => setForm({ ...form, positions: [...form.positions, emptyPosition()] });
  const removePos = (i: number) => setForm({ ...form, positions: form.positions.filter((_, idx) => idx !== i) });

  async function save() {
    const positions = form.positions
      .filter(p => p.address.trim())
      .map(p => ({ address: p.address.trim(), qty: Number(p.qty) || 1, water: p.water }));
    if (!positions.length) { setFormError('Добавьте хотя бы одну позицию с адресом'); return; }
    if (!form.phone.trim()) { setFormError('Укажите телефон'); return; }
    setFormError(''); setSaving(true);
    const body: Record<string, unknown> = {
      clientName: form.name.trim() || null,
      phone: form.phone.trim(),
      comment: form.comment.trim() || null,
      status: form.status,
      positions,
      address: positions[0].address,
      qty: positions.reduce((s, p) => s + p.qty, 0),
      waterType: positions[0].water,
    };
    if (!editingId) body.orderDate = new Date().toISOString().slice(0, 10);
    try {
      const url = editingId ? `/api/orders/${editingId}` : '/api/orders';
      const res = await fetch(url, {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      setModalOpen(false);
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Ошибка сохранения');
    }
    setSaving(false);
  }

  async function del(o: Order) {
    if (!confirm(`Удалить заявку ${o.orderNo || ''}?`)) return;
    try {
      const res = await fetch(`/api/orders/${o.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      await load();
    } catch (e) {
      alert('Ошибка удаления: ' + (e instanceof Error ? e.message : ''));
    }
  }

  const input: React.CSSProperties = { width: '100%', padding: '10px 11px', fontSize: 14, border: '1px solid #d1d5db', borderRadius: 9, outline: 'none', background: '#fff', color: '#111', boxSizing: 'border-box' };
  const label: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' };

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f7', fontFamily: "'Segoe UI', system-ui, sans-serif", padding: '20px 14px' }}>
      <div style={{ maxWidth: 620, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 32 }}>💧</div>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 1, color: '#111' }}>VERTEX METROLOGY</div>
          <div style={{ fontSize: 13, color: '#6b7280' }}>Заявки на поверку счётчиков воды</div>
        </div>

        <button onClick={openCreate} style={{ width: '100%', background: BRAND, color: '#fff', border: 'none', borderRadius: 12, padding: 14, fontSize: 16, fontWeight: 700, cursor: 'pointer', marginBottom: 16 }}>
          ➕ Создать заявку
        </button>

        {/* Orders list */}
        {loading ? (
          <div style={{ textAlign: 'center', color: '#9ca3af', padding: 30 }}>Загрузка…</div>
        ) : listError ? (
          <div style={{ textAlign: 'center', color: '#dc2626', padding: 20 }}>⚠️ {listError} <button onClick={load} style={{ marginLeft: 8, color: BRAND, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>↻</button></div>
        ) : orders.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#9ca3af', padding: 30 }}>Заявок пока нет</div>
        ) : (
          orders.map(o => {
            const st = statusStyle[o.status] || statusStyle['В работе'];
            const positions = o.positions && o.positions.length ? o.positions : [{ address: o.address || '', qty: o.qty || 0, water: o.waterType || '' }];
            return (
              <div key={o.id} style={{ background: '#fff', borderRadius: 14, padding: 14, marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div>
                    <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#6b7280' }}>{o.orderNo}</span>
                    {o.orderDate && <span style={{ fontSize: 12, color: '#9ca3af', marginLeft: 8 }}>{String(o.orderDate).slice(0, 10).split('-').reverse().join('.')}</span>}
                  </div>
                  <span style={{ background: st.bg, color: st.fg, fontSize: 11, fontWeight: 700, borderRadius: 20, padding: '3px 10px' }}>{st.label}</span>
                </div>
                {o.clientName && <div style={{ fontWeight: 700, fontSize: 14 }}>{o.clientName}</div>}
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>📞 {o.phone || '—'}</div>
                <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 6 }}>
                  {positions.map((p, i) => (
                    <div key={i} style={{ fontSize: 13, color: '#374151', padding: '2px 0' }}>
                      📍 {p.address} — <strong>{p.qty} шт.</strong> · {p.water}
                    </div>
                  ))}
                </div>
                {o.comment && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 6 }}>💬 {o.comment}</div>}
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button onClick={() => openEdit(o)} style={{ flex: 1, background: '#eef2ff', color: BRAND, border: 'none', borderRadius: 9, padding: '9px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>✏️ Изменить</button>
                  <button onClick={() => del(o)} style={{ flex: 1, background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: 9, padding: '9px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>🗑️ Удалить</button>
                </div>
              </div>
            );
          })
        )}

        <div style={{ textAlign: 'center', fontSize: 11, color: '#9ca3af', marginTop: 16 }}>ТОО «VERTEX METROLOGY» · Поверка приборов учёта воды</div>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div onClick={() => !saving && setModalOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '20px 14px', overflowY: 'auto', zIndex: 100 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 520, padding: 20, boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 17, fontWeight: 800 }}>{editingId ? 'Изменить заявку' : 'Новая заявка'}</div>
              <button onClick={() => setModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#9ca3af' }}>✕</button>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={label}>Ваше имя</label>
              <input style={input} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="ФИО или организация" />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={label}>Телефон *</label>
              <input style={input} type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+7 700 000 00 00" />
            </div>

            {/* Positions */}
            <label style={label}>Позиции (адрес · кол-во · тип воды)</label>
            {form.positions.map((p, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center' }}>
                <input style={{ ...input, flex: 3 }} value={p.address} onChange={e => setPos(i, 'address', e.target.value)} placeholder="Адрес" />
                <input style={{ ...input, flex: 1, minWidth: 52 }} type="number" min={1} value={p.qty} onChange={e => setPos(i, 'qty', e.target.value)} />
                <select style={{ ...input, flex: 2, minWidth: 90 }} value={p.water} onChange={e => setPos(i, 'water', e.target.value)}>
                  <option>Холодная</option>
                  <option>Горячая</option>
                </select>
                <button onClick={() => removePos(i)} disabled={form.positions.length <= 1} style={{ background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: 8, width: 34, height: 34, fontSize: 14, cursor: form.positions.length <= 1 ? 'default' : 'pointer', opacity: form.positions.length <= 1 ? 0.4 : 1, flexShrink: 0 }}>✕</button>
              </div>
            ))}
            <button onClick={addPos} style={{ background: '#eef2ff', color: BRAND, border: 'none', borderRadius: 9, padding: '8px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: 14 }}>➕ Добавить позицию</button>

            <div style={{ marginBottom: 12 }}>
              <label style={label}>Комментарий</label>
              <textarea style={{ ...input, minHeight: 56, resize: 'vertical', fontFamily: 'inherit' }} value={form.comment} onChange={e => setForm({ ...form, comment: e.target.value })} placeholder="Удобное время, доступ и т.д." />
            </div>
            {editingId && (
              <div style={{ marginBottom: 12 }}>
                <label style={label}>Статус</label>
                <select style={input} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                  {STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
            )}

            {formError && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 10, textAlign: 'center' }}>⚠️ {formError}</div>}

            <button onClick={save} disabled={saving} style={{ width: '100%', background: saving ? '#93a4d6' : BRAND, color: '#fff', border: 'none', borderRadius: 11, padding: 13, fontSize: 15, fontWeight: 700, cursor: saving ? 'default' : 'pointer' }}>
              {saving ? 'Сохранение…' : editingId ? '💾 Сохранить' : '📤 Отправить заявку'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
