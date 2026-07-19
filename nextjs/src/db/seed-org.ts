// Идемпотентный сев реквизитов организации + печать/подпись/логотип (из образцов).
//   tsx --env-file=.env.local src/db/seed-org.ts
import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';
import { join } from 'path';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');
const sql = neon(process.env.DATABASE_URL);

const dir = join(process.cwd(), 'src/db/org-assets');
const b64 = (f: string) => 'data:image/png;base64,' + readFileSync(join(dir, f)).toString('base64');

const banks = [
  { key: 'kaspi', name: 'АО "Kaspi Bank"', iik: 'KZ16722S000050961996', bik: 'CASPKZKA', kbe: '17' },
  { key: 'bck', name: 'АО "Банк ЦентрКредит"', iik: 'KZ678562203151891360', bik: 'KCJBKZKX', kbe: '17' },
];

(async () => {
  const existing = (await sql`select id from org_settings where id = 1`)[0];
  if (existing) { console.log('org_settings уже есть — пропуск (правится в Настройки → Организация)'); return; }
  await sql`insert into org_settings
    (id, company_name, company_full, bin, address, phone, director_name, banks, logo_b64, stamp_b64, sign_b64)
    values (1,
      ${'ТОО "VERTEX SERVICE"'},
      ${'Товарищество с ограниченной ответственностью "VERTEX SERVICE"'},
      ${'250540031662'},
      ${'РК, г. Тараз, улица Қазыбек би, дом 138, офис 102'},
      ${'+7 707 588 40 44'},
      ${'Молдабаев М.А.'},
      ${JSON.stringify(banks)}::jsonb,
      ${b64('logo.png')}, ${b64('stamp.png')}, ${b64('sign.png')})`;
  console.log('org_settings засеяны: реквизиты VERTEX SERVICE + 2 банка + логотип/печать/подпись');
})();
