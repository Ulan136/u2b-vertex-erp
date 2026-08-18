'use client';
import * as React from 'react';
import { apiSend } from '@/lib/api';
import { toast } from '@/lib/toast';
import { Select, Input, Button } from '@/components/ui';

export type PickClient = { id: string; name: string; phone?: string | null; kind?: string | null };

// Выбор клиента/покупателя из справочника + быстрое добавление нового прямо тут
// (не выходя из модалки). Создаёт через POST /api/v2/clients и сразу выбирает.
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
  const word = kind === 'buyer' ? 'покупатель' : 'клиент';

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
    <div>
      <div style={{ display: 'flex', gap: 6 }}>
        <Select value="" onChange={e => { const c = clients.find(x => x.id === e.target.value); if (c) onPick(c); }} style={{ flex: 1 }}>
          <option value="">{placeholder || '— из справочника —'}</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
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
