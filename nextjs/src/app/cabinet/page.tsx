'use client';

import { useState } from 'react';

const BRAND = '#1d4ed8';

export default function CabinetPage() {
  const [form, setForm] = useState({
    name: '',
    address: '',
    phone: '',
    qty: '1',
    water: 'Холодная',
    comment: '',
  });
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [orderNo, setOrderNo] = useState('');
  const [error, setError] = useState('');

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  async function submit() {
    if (!form.address.trim()) { setError('Укажите адрес'); return; }
    if (!form.phone.trim()) { setError('Укажите телефон'); return; }
    setError('');
    setStatus('sending');
    const today = new Date().toISOString().slice(0, 10);
    const comment = [form.name.trim() && `Клиент: ${form.name.trim()}`, form.comment.trim()]
      .filter(Boolean).join('. ');
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderDate: today,
          address: form.address.trim(),
          phone: form.phone.trim(),
          qty: Number(form.qty) || 1,
          waterType: form.water,
          comment: comment || null,
          status: 'В работе',
        }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const order = await res.json();
      setOrderNo(order.orderNo || '');
      setStatus('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка отправки');
      setStatus('error');
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '11px 12px', fontSize: 15, border: '1px solid #d1d5db',
    borderRadius: 10, outline: 'none', background: '#fff', color: '#111', boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5, display: 'block' };
  const fieldStyle: React.CSSProperties = { marginBottom: 14 };

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f7', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '20px 14px', fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <div style={{ width: '100%', maxWidth: 480 }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 34 }}>💧</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#111' }}>Vertex Metrology</div>
          <div style={{ fontSize: 13, color: '#6b7280' }}>Заявка на поверку счётчиков воды</div>
        </div>

        {status === 'done' ? (
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, textAlign: 'center', boxShadow: '0 4px 24px rgba(0,0,0,.06)' }}>
            <div style={{ fontSize: 46 }}>✅</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#059669', marginTop: 6 }}>Заявка отправлена!</div>
            {orderNo && (
              <div style={{ fontSize: 14, color: '#374151', marginTop: 8 }}>
                Номер заявки: <strong style={{ fontFamily: 'monospace' }}>{orderNo}</strong>
              </div>
            )}
            <div style={{ fontSize: 13, color: '#6b7280', marginTop: 10, lineHeight: 1.5 }}>
              Наш мастер свяжется с вами по указанному телефону<br />и согласует время выезда.
            </div>
            <button
              onClick={() => { setForm({ name: '', address: '', phone: '', qty: '1', water: 'Холодная', comment: '' }); setStatus('idle'); setOrderNo(''); }}
              style={{ marginTop: 18, background: '#eef2ff', color: BRAND, border: 'none', borderRadius: 10, padding: '11px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
            >
              Отправить ещё одну заявку
            </button>
          </div>
        ) : (
          <div style={{ background: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 4px 24px rgba(0,0,0,.06)' }}>
            <div style={fieldStyle}>
              <label style={labelStyle}>Ваше имя</label>
              <input style={inputStyle} value={form.name} onChange={set('name')} placeholder="ФИО или название организации" />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Адрес *</label>
              <input style={inputStyle} value={form.address} onChange={set('address')} placeholder="Город, улица, дом, квартира" />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Телефон *</label>
              <input style={inputStyle} type="tel" value={form.phone} onChange={set('phone')} placeholder="+7 700 000 00 00" />
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ ...fieldStyle, flex: 1 }}>
                <label style={labelStyle}>Кол-во счётчиков</label>
                <input style={inputStyle} type="number" min={1} value={form.qty} onChange={set('qty')} />
              </div>
              <div style={{ ...fieldStyle, flex: 1 }}>
                <label style={labelStyle}>Тип воды</label>
                <select style={inputStyle} value={form.water} onChange={set('water')}>
                  <option>Холодная</option>
                  <option>Горячая</option>
                </select>
              </div>
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Комментарий</label>
              <textarea style={{ ...inputStyle, minHeight: 70, resize: 'vertical', fontFamily: 'inherit' }} value={form.comment} onChange={set('comment')} placeholder="Удобное время, особенности доступа и т.д." />
            </div>

            {error && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 12, textAlign: 'center' }}>⚠️ {error}</div>}

            <button
              onClick={submit}
              disabled={status === 'sending'}
              style={{ width: '100%', background: status === 'sending' ? '#93a4d6' : BRAND, color: '#fff', border: 'none', borderRadius: 12, padding: '14px', fontSize: 16, fontWeight: 700, cursor: status === 'sending' ? 'default' : 'pointer' }}
            >
              {status === 'sending' ? 'Отправка…' : '📤 Отправить заявку'}
            </button>
          </div>
        )}

        <div style={{ textAlign: 'center', fontSize: 11, color: '#9ca3af', marginTop: 16 }}>
          ТОО «Vertex Metrology» · Поверка приборов учёта воды
        </div>
      </div>
    </div>
  );
}
