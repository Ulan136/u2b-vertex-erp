'use client';
import * as React from 'react';
import { useApi, apiSend } from '@/lib/api';
import { toast } from '@/lib/toast';
import { Card, Button, PageTitle, Field, Input } from '@/components/ui';

type Bank = { key: string; name: string; iik: string; bik: string; kbe?: string };
type Org = { companyName?: string; companyFull?: string; bin?: string; address?: string; phone?: string; directorName?: string; banks?: Bank[]; logoB64?: string; stampB64?: string; signB64?: string };

export default function OrgSettingsPage() {
  const { data, mutate } = useApi<Org>('/api/v2/org');
  const [o, setO] = React.useState<Org>({});
  React.useEffect(() => { if (data) setO({ ...data, banks: data.banks || [] }); }, [data]);

  async function save() {
    try { await apiSend('/api/v2/org', 'PATCH', { companyName: o.companyName, companyFull: o.companyFull, bin: o.bin, address: o.address, phone: o.phone, directorName: o.directorName, banks: o.banks }); await mutate(); toast('✅ Реквизиты сохранены'); }
    catch (e) { toast('⚠️ ' + (e as Error).message); }
  }
  function upload(field: 'logoB64' | 'stampB64' | 'signB64', file?: File) {
    if (!file) return; const r = new FileReader();
    r.onload = async () => { try { await apiSend('/api/v2/org', 'PATCH', { [field]: r.result }); await mutate(); toast('✅ Изображение обновлено'); } catch (e) { toast('⚠️ ' + (e as Error).message); } };
    r.readAsDataURL(file);
  }
  const imgBox = (title: string, field: 'logoB64' | 'stampB64' | 'signB64', w = 110) => (
    <div style={{ textAlign: 'center' }}>
      <div className="erp-muted" style={{ fontSize: 12, marginBottom: 6 }}>{title}</div>
      {o[field] ? <img src={o[field]} alt="" style={{ width: w, height: 110, objectFit: 'contain', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff' }} /> : <div style={{ width: w, height: 110, border: '1px dashed #cbd5e1', borderRadius: 8 }} />}
      <div><label className="ui-btn ui-btn-outline" style={{ marginTop: 6, display: 'inline-block', cursor: 'pointer', fontSize: 12 }}>Заменить<input type="file" accept="image/png,image/jpeg" style={{ display: 'none' }} onChange={e => upload(field, e.target.files?.[0])} /></label></div>
    </div>
  );

  return (
    <div>
      <PageTitle title="Организация" sub="Реквизиты, печать и подпись (для документов)" />
      <Card>
        <h3>🏢 Реквизиты</h3>
        <div className="erp-form-row"><Field label="Название"><Input value={o.companyName || ''} onChange={e => setO({ ...o, companyName: e.target.value })} /></Field><Field label="БИН"><Input value={o.bin || ''} onChange={e => setO({ ...o, bin: e.target.value })} /></Field></div>
        <div className="erp-form-row"><Field label="Директор"><Input value={o.directorName || ''} onChange={e => setO({ ...o, directorName: e.target.value })} /></Field><Field label="Телефон"><Input value={o.phone || ''} onChange={e => setO({ ...o, phone: e.target.value })} /></Field></div>
        <Field label="Полное название"><Input value={o.companyFull || ''} onChange={e => setO({ ...o, companyFull: e.target.value })} /></Field>
        <Field label="Адрес"><Input value={o.address || ''} onChange={e => setO({ ...o, address: e.target.value })} /></Field>
        <h3 style={{ marginTop: 14 }}>🏦 Банковские счета</h3>
        {(o.banks || []).map((b, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.6fr 1fr 70px', gap: 8, marginBottom: 8 }}>
            <Input value={b.name} onChange={e => { const n = [...(o.banks || [])]; n[i] = { ...b, name: e.target.value }; setO({ ...o, banks: n }); }} placeholder="Банк" />
            <Input value={b.iik} onChange={e => { const n = [...(o.banks || [])]; n[i] = { ...b, iik: e.target.value }; setO({ ...o, banks: n }); }} placeholder="ИИК" />
            <Input value={b.bik} onChange={e => { const n = [...(o.banks || [])]; n[i] = { ...b, bik: e.target.value }; setO({ ...o, banks: n }); }} placeholder="БИК" />
            <Input value={b.kbe || ''} onChange={e => { const n = [...(o.banks || [])]; n[i] = { ...b, kbe: e.target.value }; setO({ ...o, banks: n }); }} placeholder="Кбе" />
          </div>
        ))}
        <Button onClick={save} style={{ marginTop: 12 }}>💾 Сохранить реквизиты</Button>
      </Card>
      <Card style={{ marginTop: 14 }}>
        <h3>🔵 Печать и подпись</h3>
        <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap', marginTop: 8 }}>{imgBox('Логотип', 'logoB64')}{imgBox('Печать', 'stampB64')}{imgBox('Подпись', 'signB64', 150)}</div>
      </Card>
    </div>
  );
}
