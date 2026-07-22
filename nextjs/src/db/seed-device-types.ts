// Идемпотентный сид справочника типов приборов (запускать после миграции 0020):
//   tsx --env-file=.env.local src/db/seed-device-types.ts
// Источник — docs/Справочник типов приборов — ЕДИНЫЙ.txt (92 типа, 5 групп).
// Стартовый usage_count по группам: 1000 / 100 / 30 / 5 / 0 (market),
// чтобы подсказки сразу сортировались реалистично. Нормализация и алиасы —
// как в src/server/dto/deviceTypes.dto.ts. on conflict (norm) do nothing → идемпотентно.
import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';
import { join } from 'path';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');
const sql = neon(process.env.DATABASE_URL);

const normDisplay = (s: unknown) => String(s ?? '').trim().replace(/\s+/g, ' ');
const normKey = (s: unknown) => normDisplay(s).toLowerCase().replace(/с/g, 'c').replace(/в/g, 'b').replace(/к/g, 'k');
const GROUP: Record<string, number> = { 'ГРУППА 1': 1000, 'ГРУППА 2': 100, 'ГРУППА 3': 30, 'ГРУППА 4': 5, 'ГРУППА 5': 0 };

(async () => {
  const file = join(process.cwd(), 'docs', 'Справочник типов приборов — ЕДИНЫЙ.txt');
  const raw = readFileSync(file, 'utf8').split(/\r?\n/);
  let count: number | null = null, stop = false, types = 0, aliases = 0, skipped = 0;
  for (const line of raw) {
    if (line.includes('ПРАВИЛА ЗАГРУЗКИ')) stop = true;
    if (stop) continue;
    const g = Object.keys(GROUP).find(k => line.includes(k));
    if (g) { count = GROUP[g]; continue; }
    if (!line.includes('|')) continue;
    const parts = line.split('|');
    const name = normDisplay(parts[0]);
    if (!name || count === null) continue;
    const norm = normKey(name);
    const [row] = await sql`insert into device_types (name, norm, usage_count) values (${name}, ${norm}, ${count})
                            on conflict (norm) do nothing returning id`;
    let devId: string;
    if (!row) { skipped++; const [ex] = await sql`select id from device_types where norm = ${norm}`; if (!ex) continue; devId = ex.id; }
    else { types++; devId = row.id; }
    const aliasCol = (parts[2] || '').replace(/["\t]/g, ' ');
    const als = aliasCol.split(/[;,]/).map(a => normDisplay(a)).filter(a => a && normKey(a) !== norm);
    const seen = new Set<string>();
    for (const a of als) {
      const an = normKey(a); if (seen.has(an)) continue; seen.add(an);
      const [dup] = await sql`select id from device_type_aliases where device_type_id = ${devId} and norm = ${an}`;
      if (dup) continue;
      await sql`insert into device_type_aliases (alias, norm, device_type_id) values (${a}, ${an}, ${devId})`;
      aliases++;
    }
  }
  const [{ c }] = await sql`select count(*)::int c from device_types`;
  const [{ a }] = await sql`select count(*)::int a from device_type_aliases`;
  console.log(`✅ сид: типов +${types} (дублей ${skipped}), алиасов +${aliases} · всего: типов=${c}, алиасов=${a}`);
})().catch(err => { console.error(err); process.exit(1); });
