'use client';

import { Suspense, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';

const BRAND = '#1d4ed8';

function LoginForm() {
  const params = useSearchParams();
  const from = params.get('from') || '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const res = await signIn('credentials', { email: email.trim(), password, redirect: false });
      if (res?.error) { setError('Неверный email или пароль, либо пользователь деактивирован'); setBusy(false); return; }
      window.location.href = from.startsWith('/') ? from : '/';
    } catch {
      setError('Ошибка входа'); setBusy(false);
    }
  }

  const input: React.CSSProperties = { width: '100%', padding: '11px 12px', fontSize: 15, border: '1px solid #d1d5db', borderRadius: 10, outline: 'none', background: '#fff', color: '#111', boxSizing: 'border-box' };
  const label: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5, display: 'block' };

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f7', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px 14px', fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <form onSubmit={submit} style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 34 }}>💧</div>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 1, color: '#111' }}>U2B-VERTEX ERP</div>
          <div style={{ fontSize: 13, color: '#6b7280' }}>Вход в систему</div>
        </div>
        <div style={{ background: '#fff', borderRadius: 16, padding: 22, boxShadow: '0 4px 24px rgba(0,0,0,.06)' }}>
          <div style={{ marginBottom: 14 }}>
            <label style={label}>Email</label>
            <input style={input} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="user@vertex.kz" autoFocus required />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={label}>Пароль</label>
            <input style={input} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••" required />
          </div>
          {error && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 12, textAlign: 'center' }}>⚠️ {error}</div>}
          <button type="submit" disabled={busy} style={{ width: '100%', background: busy ? '#93a4d6' : BRAND, color: '#fff', border: 'none', borderRadius: 12, padding: 14, fontSize: 16, fontWeight: 700, cursor: busy ? 'default' : 'pointer' }}>
            {busy ? 'Вход…' : 'Войти'}
          </button>
        </div>
        <div style={{ textAlign: 'center', fontSize: 11, color: '#9ca3af', marginTop: 16 }}>ТОО «VERTEX METROLOGY»</div>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
