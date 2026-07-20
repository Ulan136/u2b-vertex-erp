import Link from 'next/link';
import { Card, Badge, PageTitle } from '@/components/ui';

const REF = [
  { icon: '📡', title: 'Типы счётчиков', items: ['ХВС (х/в)', 'ГВС (г/в)', 'Газ', 'Тепло', 'Расходомер'] },
  { icon: '🏢', title: 'Направления поверки', items: ['САМИ', 'ВДК', 'ТЭЦ', 'Выездная', 'Первичная (КМ/АК)', 'Астана'] },
  { icon: '📦', title: 'Категории товаров', items: ['Счётчики', 'Расходники', 'Оборудование', 'Радиомодемы'] },
  { icon: '👤', title: 'Типы клиентов', items: ['Физ. лицо', 'Юр. лицо (ТОО)', 'ИП'] },
  { icon: '💳', title: 'Способы оплаты', items: ['Каспи', 'БЦК', 'Наличка'] },
  { icon: '📄', title: 'Разделы финансов', items: ['№1 Поверка', '№2 Продажа', '№3 Филиалы', '№4 Прочие операции'] },
];

export default function HandbookPage() {
  return (
    <div>
      <PageTitle title="Справочник" sub="Основные классификаторы системы" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 12 }}>
        {REF.map(r => (
          <Card key={r.title}>
            <h3>{r.icon} {r.title}</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>{r.items.map(i => <Badge key={i} tone="neutral">{i}</Badge>)}</div>
          </Card>
        ))}
      </div>
      <p className="erp-muted" style={{ fontSize: 12, marginTop: 12 }}>Управляемые справочники (клиенты, пользователи, филиалы, категории расходов) — в <Link href="/erp/settings">Настройках</Link> и на своих экранах.</p>
    </div>
  );
}
