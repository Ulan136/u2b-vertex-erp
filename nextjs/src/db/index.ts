import ws from 'ws';
import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL not set');
}

// Транзакции (продажа/зарплата/долг/финоперация) требуют интерактивной сессии —
// это WebSocket-драйвер Neon (neon-serverless), а не HTTP. Обычные одиночные
// запросы идут через fetch (poolQueryViaFetch) — без накладных на WS; транзакции
// открывают WS только на время BEGIN…COMMIT.
if (!(globalThis as unknown as { WebSocket?: unknown }).WebSocket) {
  neonConfig.webSocketConstructor = ws;
}
neonConfig.poolQueryViaFetch = true;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

// Исполнитель запроса: либо основной `db`, либо транзакция `tx`. Репозитории
// принимают его параметром (по умолчанию `db`), чтобы сервис мог обернуть
// несколько записей в одну атомарную транзакцию.
export type Executor = PgDatabase<PgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>;
