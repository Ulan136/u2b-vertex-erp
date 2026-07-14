// One-off migration runner: applies a .sql file statement-by-statement over
// the Neon HTTP driver. Statements are separated by drizzle's
// `--> statement-breakpoint` marker. Usage:
//   tsx --env-file=.env.local src/db/apply-migration.ts drizzle/migrations/0001_clients.sql
import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

const file = process.argv[2];
if (!file) throw new Error('usage: apply-migration.ts <path-to-sql>');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');

const sql = neon(process.env.DATABASE_URL);
const statements = readFileSync(file, 'utf8')
  .split('--> statement-breakpoint')
  .map(s => s.replace(/^\s*--.*$/gm, '').trim())   // strip comment-only lines
  .filter(Boolean);

(async () => {
  for (let i = 0; i < statements.length; i++) {
    process.stdout.write(`[${i + 1}/${statements.length}] applying… `);
    await sql.query(statements[i]);
    console.log('ok');
  }
  console.log(`Done: ${statements.length} statements from ${file}`);
})().catch(err => { console.error(err); process.exit(1); });
