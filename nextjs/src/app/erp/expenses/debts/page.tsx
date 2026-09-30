'use client';
import * as React from 'react';
import { useApi, apiSend } from '@/lib/api';
import { toast } from '@/lib/toast';
import { formatDate } from '@/lib/format';
import { Card, Badge, Button, PageTitle, Modal, Field, Input, MoneyInput, Select, EmptyRow } from '@/components/ui';

type Loan = { id: string; debtorName: string; amount: string | number; returned: string | number; accountId?: string | null; accountName?: string | null; comment?: string | null; createdByName?: string | null; createdAt?: string | null; closedAt?: string | null };
type Acct = { id: string; name: string; section?: string | null; icon?: string | null; isActive?: boolean };

const num = (v: unknown) => Number(v) || 0;
const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU') + ' ₸';
const dmy = (d?: string | null) => formatDate(d) || '—';

export default function LoansPage() {
  const { data: loans, isLoading, error, mutate } = useApi<Loan[]>('/api/v2/loans');
  const { data: fin } = useApi<{ accounts: Acct[] }>('/api/v2/finance');
  const accts = (fin?.accounts || []).filter(a => a.isActive !== false);

  // Список известных должников (для автоподсказки) — собираем из существующих долгов.
  const debtors = React.useMemo(() => Array.from(new Set((loans || []).map(l => l.debtorName.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ru')), [loans]);

  const [give, setGive] = React.useState<null | { debtorName: string; amount: string; accountId: string; comment: string; saving: boolean; err: string }>(null);
  const [ret, setRet] = React.useState<null | { loan: Loan; amount: string; accountId: string; saving: boolean; err: string }>(null);

  const list = (loans || []);
  const outstanding = (l: Loan) => Math.max(0, Math.round((num(l.amount) - num(l.returned)) * 100) / 100);
  const totalOut = list.reduce((s, l) => s + outstanding(l), 0);

  function openGive() { setGive({ debtorName: '', amount: '', accountId: '', comment: '', saving: false, err: '' }); }
  async function submitGive() {
    if (!give) return;
    if (!give.debtorName.trim()) { setGive({ ...give, err: 'Укажите имя должника' }); return; }
    if (num(give.amount) <= 0) { setGive({ ...give, err: 'Укажите сумму' }); return; }
    if (!give.accountId) { setGive({ ...give, err: 'Выберите счёт, с которого выдаёте' }); return; }
    setGive({ ...give, saving: true, err: '' });
    try {
      await apiSend('/api/v2/loans', 'POST', { debtorName: give.debtorName.trim(), amount: num(give.amount), accountId: give.accountId, comment: give.comment || null });
      setGive(null); await mutate(); toast('✅ Долг выдан — деньги списаны со счёта');
    } catch (e) { setGive({ ...give, saving: false, err: (e as Error).message }); }
  }

  function openReturn(l: Loan) { setRet({ loan: l, amount: String(outstanding(l)), accountId: l.accountId || '', saving: false, err: '' }); }
  async function submitReturn() {
    if (!ret) return;
    if (num(ret.amount) <= 0) { setRet({ ...ret, err: 'Укажите сумму' }); return; }
    if (!ret.accountId) { setRet({ ...ret, err: 'Выберите счёт, на который вернули' }); return; }
    setRet({ ...ret, saving: true, err: '' });
    try {
      await apiSend(`/api/v2/loans/${ret.loan.id}/return`, 'POST', { amount: num(ret.amount), accountId: ret.accountId });
      setRet(null); await mutate(); toast('✅ Возврат принят — деньги пришли на счёт');
    } catch (e) { setRet({ ...ret, saving: false, err: (e as Error).message }); }
  }

  const acctOpts = (
    <>
      <option value="">— счёт —</option>
      {accts.map(a => <option key={a.id} value={a.id}>{a.icon || '💳'} {a.name}</option>)}
    </>
  );

  return (
    <div>
      <PageTitle title="Долги" sub="Выдали деньги в долг → ждём возврат. Просто: имя, счёт выдачи, счёт возврата." action={<Button onClick={openGive}>+ Выдать долг</Button>} />

      <div className="erp-kpi-grid" style={{ marginTop: 12 }}>
        <div className="erp-kpi"><div className="erp-kpi-top"><span className="erp-kpi-ico">🤝</span><span className="erp-kpi-label">Нам должны (остаток)</span></div><div className="erp-kpi-val" style={{ color: totalOut ? '#b45309' : '#16a34a' }}>{fmt(totalOut)}</div></div>
        <div className="erp-kpi"><div className="erp-kpi-top"><span className="erp-kpi-ico">📋</span><span className="erp-kpi-label">Должников (открыто)</span></div><div className="erp-kpi-val">{list.filter(l => outstanding(l) > 0).length}</div></div>
      </div>

      <Card className="erp-journal" style={{ marginTop: 12, padding: 0 }}>
        {error ? <EmptyRow>Нет доступа к разделу.</EmptyRow> : isLoading ? <EmptyRow>Загрузка…</EmptyRow>
          : list.length === 0 ? <EmptyRow>Долгов нет. Нажмите «+ Выдать долг».</EmptyRow>
          : (
            <table className="erp-table">
              <thead><tr><th>Должник</th><th>Дата</th><th style={{ textAlign: 'right' }}>Выдано</th><th style={{ textAlign: 'right' }}>Возвращено</th><th style={{ textAlign: 'right' }}>Остаток</th><th>Счёт выдачи</th><th>Статус</th><th>Автор</th><th style={{ textAlign: 'center' }}></th></tr></thead>
              <tbody>
                {list.map(l => {
                  const rem = outstanding(l);
                  return (
                    <tr key={l.id}>
                      <td className="erp-td-main">{l.debtorName}{l.comment ? <div className="erp-muted" style={{ fontSize: 11 }}>{l.comment}</div> : null}</td>
                      <td className="erp-muted" style={{ fontSize: 12 }}>{dmy(l.createdAt)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(num(l.amount))}</td>
                      <td style={{ textAlign: 'right', color: '#16a34a' }}>{fmt(num(l.returned))}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: rem ? '#b45309' : '#16a34a' }}>{fmt(rem)}</td>
                      <td style={{ fontSize: 12 }}>{l.accountName || '—'}</td>
                      <td>{rem <= 0 ? <Badge tone="ok">✅ Возвращён</Badge> : num(l.returned) > 0 ? <Badge tone="info">◑ Частично</Badge> : <Badge tone="warn">⏳ Открыт</Badge>}</td>
                      <td className="erp-muted" style={{ fontSize: 12 }}>{l.createdByName || '—'}</td>
                      <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                        {rem > 0 && <Button variant="outline" onClick={() => openReturn(l)} style={{ fontSize: 12, padding: '4px 8px' }}>💵 Возврат</Button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
      </Card>

      {/* Выдать долг */}
      <Modal open={!!give} onClose={() => { if (!give?.saving) setGive(null); }} width={460} title={<span>🤝 Выдать долг</span>}
        footer={<><Button onClick={submitGive} disabled={give?.saving}>{give?.saving ? 'Выдаём…' : 'Выдать (списать со счёта)'}</Button><Button variant="outline" onClick={() => setGive(null)} disabled={give?.saving}>Отмена</Button></>}>
        {give && (<>
          {give.err && <div className="erp-form-err">{give.err}</div>}
          <Field label="Должник (имя)" required><Input value={give.debtorName} list="loan-debtors" onChange={e => setGive({ ...give, debtorName: e.target.value })} placeholder="ФИО / кому выдаём" autoFocus /></Field>
          <datalist id="loan-debtors">{debtors.map(d => <option key={d} value={d} />)}</datalist>
          <div className="erp-form-row">
            <Field label="Сумма (₸)" required><MoneyInput value={give.amount} onValue={v => setGive({ ...give, amount: v })} placeholder="0" /></Field>
            <Field label="С какого счёта выдать" required><Select value={give.accountId} onChange={e => setGive({ ...give, accountId: e.target.value })}>{acctOpts}</Select></Field>
          </div>
          <Field label="Комментарий"><Input value={give.comment} onChange={e => setGive({ ...give, comment: e.target.value })} placeholder="за что / когда вернёт" /></Field>
          <div className="erp-muted" style={{ fontSize: 12 }}>Деньги спишутся со счёта сейчас; при возврате вернутся на выбранный счёт.</div>
        </>)}
      </Modal>

      {/* Возврат */}
      <Modal open={!!ret} onClose={() => { if (!ret?.saving) setRet(null); }} width={440} title={<span>💵 Возврат долга — {ret?.loan.debtorName}</span>}
        footer={<><Button onClick={submitReturn} disabled={ret?.saving}>{ret?.saving ? 'Принимаем…' : 'Принять возврат'}</Button><Button variant="outline" onClick={() => setRet(null)} disabled={ret?.saving}>Отмена</Button></>}>
        {ret && (<>
          {ret.err && <div className="erp-form-err">{ret.err}</div>}
          <div style={{ fontSize: 13, marginBottom: 8 }}>Остаток долга: <b style={{ color: '#b45309' }}>{fmt(outstanding(ret.loan))}</b></div>
          <div className="erp-form-row">
            <Field label="Сумма возврата (₸)" required><MoneyInput value={ret.amount} onValue={v => setRet({ ...ret, amount: v })} placeholder="0" /></Field>
            <Field label="На какой счёт вернули" required><Select value={ret.accountId} onChange={e => setRet({ ...ret, accountId: e.target.value })}>{acctOpts}</Select></Field>
          </div>
        </>)}
      </Modal>
    </div>
  );
}
