'use client';
import * as React from 'react';
import { apiSend } from '@/lib/api';
import { toast } from '@/lib/toast';
import { Input, Button } from '@/components/ui';

export type PickClient = { id: string; name: string; phone?: string | null; kind?: string | null };

// Выбор клиента/покупателя из справочника ПОИСКОМ (комбобокс: печатаешь — фильтрует
// справочник, выбор только из него) + быстрое добавление нового прямо тут.
// Создаёт через POST /api/v2/clients и сразу выбирает.
export default function ClientPicker({
  clients, onPick, kind = 'client', placeholder, onCreated,
}: {
  clients: PickClient[];
  onPick: (c: PickClient) => void;
  kind?: 'client' | 'buyer';
  placeholder?: string;
  onCreated?: () => void;   // обновить список (SWR mutate)
}) {
  const [adding, setAdding] = React.useState(false);
  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [q, setQ] = React.useState('');       // строка поиска по справочнику
  const [open, setOpen] = React.useState(false);
  const [hi, setHi] = React.useState(0);       // подсвеченный пункт (навигация клавишами)
  const boxRef = React.useRef<HTMLDivElement>(null);
  const word = kind === 'buyer' ? 'покупатель' : 'клиент';

  // Закрытие выпадашки по клику вне компонента.
  React.useEffect(() => {
    const h = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const term = q.trim().toLowerCase();
  const filtered = React.useMemo(() => {
    const arr = term ? clients.filter(c => (c.name || '').toLowerCase().includes(term) || (c.phone || '').toLowerCase().includes(term)) : clients;
    return arr.slice(0, 50);   // не рендерим тысячи — показываем первые 50 совпадений
  }, [clients, term]);
  React.useEffect(() => { setHi(0); }, [term]);

  function pick(c: PickClient) { onPick(c); setQ(''); setOpen(false); }

  function onKey(e: React.KeyboardEvent) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) { setOpen(true); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi(i => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); const c = filtered[hi]; if (c) pick(c); }
    else if (e.key === 'Escape') { setOpen(false); }
  }

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const c = await apiSend('/api/v2/clients', 'POST', { name: name.trim(), phone: phone || null, kind }) as PickClient;
      setName(''); setPhone(''); setAdding(false);
      onCreated?.();
      onPick(c);
      toast(kind === 'buyer' ? '✅ Покупатель добавлен' : '✅ Клиент добавлен');
    } catch (e) { toast('⚠️ ' + (e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <Input
            value={q}
            placeholder={placeholder || '🔍 Поиск в справочнике…'}
            onFocus={() => setOpen(true)}
            onChange={e => { setQ(e.target.value); setOpen(true); }}
            onKeyDown={onKey}
          />
          {open && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, marginTop: 2, maxHeight: 260, overflowY: 'auto', boxShadow: '0 6px 18px rgba(0,0,0,.14)' }}>
              {filtered.length === 0 ? (
                <div style={{ padding: '9px 11px', color: '#94a3b8', fontSize: 13 }}>{clients.length === 0 ? 'Справочник пуст' : 'Ничего не найдено'}</div>
              ) : filtered.map((c, i) => (
                <div
                  key={c.id}
                  onMouseEnter={() => setHi(i)}
                  onMouseDown={e => { e.preventDefault(); pick(c); }}
                  style={{ padding: '7px 11px', cursor: 'pointer', fontSize: 13, background: hi === i ? '#eff6ff' : '#fff', display: 'flex', justifyContent: 'space-between', gap: 8 }}
                >
                  <span>{c.name}</span>
                  {c.phone && <span style={{ color: '#94a3b8', whiteSpace: 'nowrap' }}>{c.phone}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
        <Button variant="outline" onClick={() => setAdding(a => !a)} style={{ whiteSpace: 'nowrap' }} title={`Добавить нового ${word}а`}>
          {adding ? '✕' : `➕ Новый ${word}`}
        </Button>
      </div>
      {adding && (
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <Input placeholder={`Имя (${word})`} value={name} autoFocus onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); create(); } }} />
          <Input placeholder="Телефон" value={phone} onChange={e => setPhone(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); create(); } }} style={{ maxWidth: 160 }} />
          <Button onClick={create} disabled={busy || !name.trim()} style={{ whiteSpace: 'nowrap' }}>{busy ? '…' : 'Сохранить'}</Button>
        </div>
      )}
    </div>
  );
}
