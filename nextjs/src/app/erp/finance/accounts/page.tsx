'use client';
import * as React from 'react';
import Link from 'next/link';
import { useApi, apiSend } from '@/lib/api';
import { toast } from '@/lib/toast';
import { Card, Badge, Button, PageTitle, Modal, Field, Input, Select, EmptyRow } from '@/components/ui';

type Acct = { id: string; name: string; icon?: string | null; section?: string | null; category?: string | null; balance?: string | number | null; sortOrder?: number | null };

const SECTIONS = [
  { key: 'poverka', no: 1, label: 'Поверка', icon: '📋', color: '#2563eb', sources: 'САМИ · ВДК · ТЭЦ · Выездная' },
  { key: 'sale', no: 2, label: 'Продажа', icon: '💰', color: '#d97706', sources: 'Продажа · Первичная' },
  { key: 'branch', no: 3, label: 'Филиалы', icon: '🏢', color: '#0d9488', sources: 'Филиалы (Астана…)' },
  { key: 'other', no: 4, label: 'Прочие операции', icon: '📄', color: '#6f42c1', sources: 'Проект · Тендер · Услуга' },
];
const BANKS = [{ key: 'kaspi', label: '🍊 Каспи' }, { key: 'bck', label: '🏦 БЦК' }, { key: 'nalichka', label: '💵 Наличка' }, { key: 'other', label: '💳 Другое' }];
const BANK_LABEL: Record<string, string> = { kaspi: '🍊 Каспи', bck: '🏦 БЦК', nalichka: '💵 Наличка', other: '💳 Другое' };
const num = (v: unknown) => Number(v) || 0;
const fmt = (n: number | string) => (Number(n) || 0).toLocaleString('ru-RU') + ' ₸';

export default function AccountsBindingPage() {
  const { data: fin, error, isLoading, mutate } = useApi<{ accounts: Acct[] }>('/api/v2/finance');
  const accounts = fin?.accounts || [];
  const bySection = (k: string) => accounts.filter(a => (a.section || 'other') === k).sort((a, b) => num(a.sortOrder) - num(b.sortOrder));

  const [addM, setAddM] = React.useState({ open: false, section: 'poverka', name: '', category: 'kaspi', icon: '💳', balance: '', err: '', saving: false });
  const [editM, setEditM] = React.useState({ open: false, id: '', name: '', section: 'poverka', icon: '💳', err: '', saving: false });

  function openAdd(section: string) { setAddM({ open: true, section, name: '', category: 'kaspi', icon: BANKS.find(b => b.key === 'kaspi') ? '🍊' : '💳', balance: '', err: '', saving: false }); }
  async function saveAdd() {
    if (!addM.name.trim()) { setAddM(s => ({ ...s, err: 'Название обязательно' })); return; }
    setAddM(s => ({ ...s, saving: true, err: '' }));
    try {
      await apiSend('/api/v2/finance/accounts', 'POST', { name: addM.name.trim(), category: addM.category, section: addM.section, icon: addM.icon || '💳', balance: num(addM.balance) });
      setAddM(s => ({ ...s, open: false })); await mutate(); toast('✅ Счёт создан и привязан');
    } catch (e) { setAddM(s => ({ ...s, err: (e as Error).message, saving: false })); }
  }
  function openEdit(a: Acct) { setEditM({ open: true, id: a.id, name: a.name, section: a.section || 'other', icon: a.icon || '💳', err: '', saving: false }); }
  async function saveEdit() {
    if (!editM.name.trim()) { setEditM(s => ({ ...s, err: 'Название обязательно' })); return; }
    setEditM(s => ({ ...s, saving: true, err: '' }));
    try {
      await apiSend(`/api/v2/finance/accounts/${editM.id}`, 'PATCH', { name: editM.name.trim(), section: editM.section, icon: editM.icon || '💳' });
      setEditM(s => ({ ...s, open: false })); await mutate(); toast('✅ Счёт обновлён');
    } catch (e) { setEditM(s => ({ ...s, err: (e as Error).message, saving: false })); }
  }

  return (
    <div>
      <PageTitle title="Привязка счетов" sub="Маршрут: Источник → Тип счёта (№1–№4) → Банковский счёт" action={<Link href="/erp/finance" style={{ fontSize: 13 }}>Финансы →</Link>} />

      <Card style={{ background: '#eff6ff', borderColor: '#bfdbfe', color: '#1e3a8a', fontSize: 13 }}>
        ℹ️ Каждый <b>тип счёта</b> (Поверка / Продажа / Филиалы / Прочие) — это раздел учёта. К нему привязаны <b>банковские счета</b> (Каспи / БЦК / Наличка), на которые падает доход. При операции менеджер выбирает конкретный банк. От этой привязки зависит вся касса и разбивка «Счетов».
      </Card>

      {error ? <Card style={{ marginTop: 12 }}><EmptyRow>Нет доступа к счетам.</EmptyRow></Card>
        : isLoading ? <Card style={{ marginTop: 12 }}><EmptyRow>Загрузка…</EmptyRow></Card>
        : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
            {SECTIONS.map(sec => {
              const accs = bySection(sec.key);
              const total = accs.reduce((s, a) => s + num(a.balance), 0);
              return (
                <Card key={sec.key} style={{ padding: 0, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: sec.color, color: '#fff' }}>
                    <b style={{ fontSize: 15 }}>№{sec.no} {sec.icon} {sec.label}</b>
                    <span style={{ fontSize: 12, opacity: .85 }}>Источники: {sec.sources}</span>
                    <span style={{ marginLeft: 'auto', fontWeight: 700 }}>{fmt(total)}</span>
                  </div>
                  <div style={{ padding: 12 }}>
                    {accs.length === 0 ? <div className="erp-muted" style={{ fontSize: 13, marginBottom: 8 }}>Банковских счетов не привязано.</div> : (
                      <table className="erp-table">
                        <thead><tr><th>№</th><th>Счёт</th><th>Банк</th><th style={{ textAlign: 'right' }}>Баланс</th><th style={{ textAlign: 'right' }}></th></tr></thead>
                        <tbody>{accs.map((a, i) => (
                          <tr key={a.id}>
                            <td className="erp-muted">{i + 1}</td>
                            <td className="erp-td-main">{a.icon} {a.name}</td>
                            <td><Badge tone={a.category === 'kaspi' ? 'warn' : a.category === 'nalichka' ? 'ok' : 'info'}>{BANK_LABEL[a.category || 'other']}</Badge></td>
                            <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(a.balance || 0)}</td>
                            <td style={{ textAlign: 'right' }}><button className="erp-icon-btn" title="Изменить" onClick={() => openEdit(a)}>✏️</button></td>
                          </tr>
                        ))}</tbody>
                      </table>
                    )}
                    <Button variant="outline" onClick={() => openAdd(sec.key)} style={{ marginTop: 8, fontSize: 12 }}>+ Привязать банковский счёт</Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

      <Modal open={addM.open} onClose={() => setAddM(s => ({ ...s, open: false }))} title={`➕ Счёт · ${SECTIONS.find(s => s.key === addM.section)?.label}`}
        footer={<><Button onClick={saveAdd} disabled={addM.saving}>{addM.saving ? '…' : 'Привязать'}</Button><Button variant="outline" onClick={() => setAddM(s => ({ ...s, open: false }))}>Отмена</Button></>}>
        {addM.err && <div className="erp-form-err">{addM.err}</div>}
        <Field label="Название" required><Input value={addM.name} onChange={e => setAddM({ ...addM, name: e.target.value })} placeholder="напр. Каспи" autoFocus /></Field>
        <div className="erp-form-row">
          <Field label="Тип счёта (раздел)"><Select value={addM.section} onChange={e => setAddM({ ...addM, section: e.target.value })}>{SECTIONS.map(s => <option key={s.key} value={s.key}>№{s.no} {s.label}</option>)}</Select></Field>
          <Field label="Банк"><Select value={addM.category} onChange={e => setAddM({ ...addM, category: e.target.value })}>{BANKS.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}</Select></Field>
        </div>
        <div className="erp-form-row">
          <Field label="Иконка"><Input value={addM.icon} onChange={e => setAddM({ ...addM, icon: e.target.value })} /></Field>
          <Field label="Начальный остаток (₸)"><Input type="number" value={addM.balance} onChange={e => setAddM({ ...addM, balance: e.target.value })} /></Field>
        </div>
      </Modal>

      <Modal open={editM.open} onClose={() => setEditM(s => ({ ...s, open: false }))} title="✏️ Счёт"
        footer={<><Button onClick={saveEdit} disabled={editM.saving}>{editM.saving ? '…' : 'Сохранить'}</Button><Button variant="outline" onClick={() => setEditM(s => ({ ...s, open: false }))}>Отмена</Button></>}>
        {editM.err && <div className="erp-form-err">{editM.err}</div>}
        <Field label="Название" required><Input value={editM.name} onChange={e => setEditM({ ...editM, name: e.target.value })} /></Field>
        <div className="erp-form-row">
          <Field label="Тип счёта (раздел)"><Select value={editM.section} onChange={e => setEditM({ ...editM, section: e.target.value })}>{SECTIONS.map(s => <option key={s.key} value={s.key}>№{s.no} {s.label}</option>)}</Select></Field>
          <Field label="Иконка"><Input value={editM.icon} onChange={e => setEditM({ ...editM, icon: e.target.value })} /></Field>
        </div>
        <div className="erp-muted" style={{ fontSize: 11 }}>Банк счёта менять нельзя (влияет на историю операций). Создайте новый счёт при необходимости.</div>
      </Modal>
    </div>
  );
}
