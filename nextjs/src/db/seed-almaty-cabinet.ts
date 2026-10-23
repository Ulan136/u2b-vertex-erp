// Идемпотентная настройка кабинета филиала АЛМАТЫ (точная копия Астаны).
//   tsx --env-file=.env.local src/db/seed-almaty-cabinet.ts
// Запускать ПОСЛЕ seed-branches.ts (нужен филиал «Алматы») и seed-finance-accounts.ts
// (нужны счета раздела branch_almaty).
//
// Создаёт две учётки (если их ещё нет), привязанные к филиалу Алматы:
//   • менеджер филиала  role='branch', can_expense=true  (кабинет /erp/branch-finance)
//   • мастер выезда      role='master'                    (кабинет /master)
// Телефоны ЛИПОВЫЕ (заглушки) — пользователь поправит в Настройки→Пользователи.
// Пароли временные — поменять после первого входа. Повторный запуск пароль НЕ сбрасывает.
import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');
const sql = neon(process.env.DATABASE_URL);

const USERS = [
  { email: 'almaty@vertex.kz',        name: 'Менеджер Алматы', phone: '+77000000011', position: 'Менеджер филиала', role: 'branch',  canExpense: true,  password: 'almaty123' },
  { email: 'master-almaty@vertex.kz', name: 'Мастер Алматы',   phone: '+77000000012', position: 'Выездной мастер (Алматы)', role: 'master', canExpense: false, password: 'master123' },
];

(async () => {
  // филиал Алматы (создан seed-branches.ts)
  const alm = (await sql`select id, name from branches where name ilike '%алмат%' and is_head = false limit 1`)[0];
  if (!alm) throw new Error('Нет филиала «Алматы» — сначала запусти seed-branches.ts');
  console.log('almaty branch:', alm.name, alm.id);

  for (const u of USERS) {
    const existing = (await sql`select id, email from users where email = ${u.email} limit 1`)[0];
    if (existing) {
      // учётка уже есть — только добиваем привязку/роль/право, пароль НЕ трогаем
      await sql`update users set branch_id = ${alm.id}, role = ${u.role},
                       can_expense = ${u.canExpense}, is_active = true,
                       name = ${u.name}, phone = ${u.phone}, position = ${u.position}
                where id = ${existing.id}`;
      console.log(`updated: ${u.email} (пароль не менялся)`);
      continue;
    }
    const hash = await bcrypt.hash(u.password, 10);
    await sql`insert into users (email, name, phone, position, role, branch_id, password_hash, can_expense, is_active)
              values (${u.email}, ${u.name}, ${u.phone}, ${u.position}, ${u.role}, ${alm.id}, ${hash}, ${u.canExpense}, true)`;
    console.log(`created: ${u.email} / пароль: ${u.password} (роль ${u.role})`);
  }

  console.log('Done. Логин по email или телефону; пароли временные — поменять после входа.');
})().catch(err => { console.error(err); process.exit(1); });
