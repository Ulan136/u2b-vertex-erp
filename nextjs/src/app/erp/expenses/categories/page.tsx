'use client';
import * as React from 'react';
import { useApi, apiSend } from '@/lib/api';
import { toast } from '@/lib/toast';
import { Card, Badge, Button, PageTitle, Modal, Field, Input, Select, EmptyRow } from '@/components/ui';

type Cat = { id: string; name: string; icon?: string | null; color?: string | null; base?: boolean; subs: Array<{ id: string; name: string }> };

export default function ExpenseCategoriesPage() {
  const { data: cats, error, isLoading, mutate } = useApi<Cat[]>('/api/v2/expense-categories');
  const [catModal, setCatModal] = React.useState(false);
  const [subModal, setSubModal] = React.useState(false);
  const [f, setF] = React.useState({ name: '', icon: '📦', err: '', saving: false });
  const [sf, setSf] = React.useState({ parentId: '', name: '', err: '', saving: false });

  const list = cats || [];

  async function addCat() {
    if (!f.name.trim()) { setF(s => ({ ...s, err: 'Введите название' })); return; }
    setF(s => ({ ...s, saving: true, err: '' }));
    try { await apiSend('/api/v2/expense-categories', 'POST', { name: f.name.trim(), icon: f.icon || '📦' }); setCatModal(false); setF({ name: '', icon: '📦', err: '', saving: false }); await mutate(); toast('✅ Категория добавлена'); }
    catch (e) { setF(s => ({ ...s, err: (e as Error).message, saving: false })); }
  }
  async function addSub() {
    if (!sf.parentId) { setSf(s => ({ ...s, err: 'Выберите категорию' })); return; }
    if (!sf.name.trim()) { setSf(s => ({ ...s, err: 'Введите название' })); return; }
    setSf(s => ({ ...s, saving: true, err: '' }));
    try { await apiSend('/api/v2/expense-categories', 'POST', { name: sf.name.trim(), parentId: sf.parentId }); setSubModal(false); setSf({ parentId: '', name: '', err: '', saving: false }); await mutate(); toast('✅ Подкатегория добавлена'); }
    catch (e) { setSf(s => ({ ...s, err: (e as Error).message, saving: false })); }
  }
  async function del(id: string, name: string) {
    if (!confirm(`Удалить «${name}»?`)) return;
    try { await apiSend(`/api/v2/expense-categories/${id}`, 'DELETE'); await mutate(); toast('🗑️ Удалено'); }
    catch (e) { toast('⚠️ ' + (e as Error).message); }
  }

  return (
    <div>
      <PageTitle title="Категории расходов" sub="Управление категориями и подкатегориями" action={
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="outline" onClick={() => { setSf({ parentId: list[0]?.id || '', name: '', err: '', saving: false }); setSubModal(true); }}>+ Подкатегория</Button>
          <Button onClick={() => { setF({ name: '', icon: '📦', err: '', saving: false }); setCatModal(true); }}>+ Категория</Button>
        </div>} />

      {error ? <Card><EmptyRow>Нет доступа к категориям расходов.</EmptyRow></Card>
        : isLoading ? <Card><EmptyRow>Загрузка…</EmptyRow></Card>
        : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 12 }}>
            {list.map(c => (
              <div className="ui-card" key={c.id} style={{ padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 20 }}>{c.icon || '📦'}</span>
                  <b style={{ flex: 1 }}>{c.name}</b>
                  {c.base ? <Badge tone="neutral">базовая</Badge> : <button className="erp-icon-btn" title="Удалить категорию" style={{ color: '#dc2626' }} onClick={() => del(c.id, c.name)}>🗑️</button>}
                </div>
                {c.subs.length === 0 ? <div className="erp-muted" style={{ fontSize: 12 }}>Без подкатегорий</div> : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {c.subs.map(s => (
                      <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                        <span className="erp-muted">·</span><span style={{ flex: 1 }}>{s.name}</span>
                        <button className="erp-icon-btn" title="Удалить подкатегорию" style={{ color: '#dc2626', fontSize: 12 }} onClick={() => del(s.id, s.name)}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

      <Modal open={catModal} onClose={() => setCatModal(false)} title="📁 Новая категория"
        footer={<><Button onClick={addCat} disabled={f.saving}>{f.saving ? '…' : 'Создать'}</Button><Button variant="outline" onClick={() => setCatModal(false)}>Отмена</Button></>}>
        {f.err && <div className="erp-form-err">{f.err}</div>}
        <div className="erp-form-row">
          <Field label="Название" required><Input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Напр.: Аренда, Реклама" autoFocus /></Field>
          <Field label="Иконка"><Input value={f.icon} onChange={e => setF({ ...f, icon: e.target.value })} placeholder="📦" /></Field>
        </div>
      </Modal>

      <Modal open={subModal} onClose={() => setSubModal(false)} title="📂 Новая подкатегория"
        footer={<><Button onClick={addSub} disabled={sf.saving}>{sf.saving ? '…' : 'Создать'}</Button><Button variant="outline" onClick={() => setSubModal(false)}>Отмена</Button></>}>
        {sf.err && <div className="erp-form-err">{sf.err}</div>}
        <Field label="Категория" required><Select value={sf.parentId} onChange={e => setSf({ ...sf, parentId: e.target.value })}><option value="">— выберите —</option>{list.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}</Select></Field>
        <Field label="Название подкатегории" required><Input value={sf.name} onChange={e => setSf({ ...sf, name: e.target.value })} placeholder="Напр.: Основная з/п" /></Field>
      </Modal>
    </div>
  );
}
