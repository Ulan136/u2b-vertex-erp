// Идемпотентный справочник счетов для экрана «Финансы» (после миграции 0011):
//   tsx --env-file=.env.local src/db/seed-finance-accounts.ts
// Каспи / БЦК / Наличка × Поверка / Продажа / Прочие / Филиалы. Баланс 0
// (финансовая история чистая — реальные операции вносятся через экран).
import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');
const sql = neon(process.env.DATABASE_URL);

const BANKS = [
  { name: 'Каспи', cat: 'kaspi', icon: '🍊' },
  { name: 'БЦК', cat: 'bck', icon: '🏦' },
  { name: 'Наличка', cat: 'nalichka', icon: '💵' },
];
const SECTIONS = ['poverka', 'sale', 'other', 'branch'];

(async () => {
  let created = 0;
  for (let si = 0; si < SECTIONS.length; si++) {
    for (let bi = 0; bi < BANKS.length; bi++) {
      const b = BANKS[bi], section = SECTIONS[si];
      const exists = await sql`select id from finance_accounts where name = ${b.name} and section = ${section} limit 1`;
      if (exists.length) continue;
      await sql`insert into finance_accounts (name, category, section, icon, balance, sort_order)
                values (${b.name}, ${b.cat}, ${section}, ${b.icon}, '0', ${si * 10 + bi})`;
      created++;
    }
  }
  const all = await sql`select section, count(*)::int n from finance_accounts group by section order by section`;
  console.log('created:', created, '| по разделам:', JSON.stringify(all));
  console.log('Done.');
})().catch(err => { console.error(err); process.exit(1); });
