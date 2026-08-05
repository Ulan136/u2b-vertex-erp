// Идемпотентная настройка филиалов (запускать после миграции 0010):
//   tsx --env-file=.env.local src/db/seed-branches.ts
// 1) гарантирует головной филиал (Тараз, is_head=true);
// 2) проставляет филиалы сотрудникам: Бейбіт Ғалым + master2@ → Астана,
//    остальные → головной (Тараз). Существующие заявки без филиала не трогаем
//    (в логике они считаются головным).
import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');
const sql = neon(process.env.DATABASE_URL);

const ASTANA_EMAILS = ['b.galym@vertex.kz', 'master2@vertex.kz'];

(async () => {
  // ── головной филиал (Тараз) ──
  let head = (await sql`select id, name from branches where is_head = true limit 1`)[0];
  if (!head) {
    let tar = (await sql`select id, name from branches where name ilike '%тараз%' limit 1`)[0];
    if (!tar) {
      tar = (await sql`insert into branches (name, city, is_head, is_active)
                       values ('Тараз', 'Тараз', true, true) returning id, name`)[0];
      console.log('created head branch:', tar.name);
    }
    head = tar;
  }
  await sql`update branches set is_head = false where id <> ${head.id}`;
  await sql`update branches set is_head = true where id = ${head.id}`;
  console.log('head branch:', head.name, head.id);

  // ── филиал Астаны ──
  const ast = (await sql`select id, name from branches where name ilike '%астан%' and is_head = false limit 1`)[0];
  console.log('astana branch:', ast ? `${ast.name} ${ast.id}` : '(нет — Астана-сотрудники останутся без филиала)');

  // ── назначение сотрудников ──
  if (ast) {
    const a = await sql`update users set branch_id = ${ast.id}
                        where email = any(${ASTANA_EMAILS}) returning email`;
    console.log('→ Астана:', (a as { email: string }[]).map(r => r.email).join(', ') || '(никого не нашли)');
  }
  const h = await sql`update users set branch_id = ${head.id}
                      where email <> all(${ASTANA_EMAILS}) returning email`;
  console.log(`→ Тараз (головной): ${h.length} сотрудников`);

  console.log('Done.');
})().catch(err => { console.error(err); process.exit(1); });
