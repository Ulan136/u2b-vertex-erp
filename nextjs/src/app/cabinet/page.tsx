'use client';

import { useState } from 'react';

const BRAND = '#1d4ed8';

type Position = { address: string; qty: number | string; water: string };
const emptyPos = (): Position => ({ address: '', qty: 1, water: 'Холодная' });

export default function CabinetPage() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [comment, setComment] = useState('');
  const [positions, setPositions] = useState<Position[]>([emptyPos()]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const setPos = (i: number, k: keyof Position, v: string) =>
    setPositions(positions.map((p, idx) => (idx === i ? { ...p, [k]: v } : p)));
  const addPos = () => setPositions([...positions, emptyPos()]);
  const removePos = (i: number) => setPositions(positions.length > 1 ? positions.filter((_, idx) => idx !== i) : positions);

  async function submit() {
    const pos = positions
      .filter(p => String(p.address).trim())
      .map(p => ({ address: String(p.address).trim(), qty: Number(p.qty) || 1, water: p.water }));
    if (!pos.length) { setError('Добавьте хотя бы одну позицию с адресом'); return; }
    if (!phone.trim()) { setError('Укажите телефон'); return; }
    setError(''); setSuccess(''); setSending(true);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName: name.trim() || null,
          phone: phone.trim(),
          comment: comment.trim() || null,
          status: 'В работе',
          positions: pos,
          address: pos[0].address,
          qty: pos.reduce((s, p) => s + p.qty, 0),
          waterType: pos[0].water,
          orderDate: new Date().toISOString().slice(0, 10),
        }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const order = await res.json();
      setSuccess(`✅ Заявка принята! Номер: ${order.orderNo || ''}`);
      // reset form
      setName(''); setPhone(''); setComment(''); setPositions([emptyPos()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка отправки');
    }
    setSending(false);
  }

  const input: React.CSSProperties = { width: '100%', padding: '11px 12px', fontSize: 15, border: '1px solid #d1d5db', borderRadius: 10, outline: 'none', background: '#fff', color: '#111', boxSizing: 'border-box' };
  const label: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5, display: 'block' };
  const field: React.CSSProperties = { marginBottom: 14 };

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f7', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '20px 14px', fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <div style={{ width: '100%', maxWidth: 480 }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 34 }}>💧</div>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 1, color: '#111' }}>VERTEX METROLOGY</div>
          <div style={{ fontSize: 13, color: '#6b7280' }}>Заявка на поверку счётчиков воды</div>
        </div>

        {success && (
          <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 12, padding: 14, textAlign: 'center', color: '#059669', fontWeight: 700, fontSize: 15, marginBottom: 16 }}>
            {success}
          </div>
        )}

        {/* Always-visible form */}
        <div style={{ background: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 4px 24px rgba(0,0,0,.06)' }}>
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
            {sending ? 'Отправка…' : '📤 Отправить заявку'}
          </button>
        </div>

        <div style={{ textAlign: 'center', fontSize: 11, color: '#9ca3af', marginTop: 16 }}>ТОО «VERTEX METROLOGY» · Поверка приборов учёта воды</div>
      </div>
    </div>
  );
}
