import fs from 'node:fs';
import path from 'node:path';
import { Pool as PgPool } from 'pg';
import mysql, { type Pool as MySqlPool, type RowDataPacket } from 'mysql2/promise';
import { env, getBillingDbKind, hasPostgresConfig } from './env';

export type BillingQueryRow = Record<string, unknown>;

export type BillingQueryResult<T extends BillingQueryRow = BillingQueryRow> = {
  rows: T[];
  rowCount: number;
  insertId?: number;
};

type BillingDbKind = 'postgres' | 'mysql';

type BillingConnection = {
  query<T extends BillingQueryRow = BillingQueryRow>(text: string, values?: unknown[]): Promise<BillingQueryResult<T>>;
  release(): void;
  beginTransaction?(): Promise<void>;
  commit?(): Promise<void>;
  rollback?(): Promise<void>;
};

let pgPool: PgPool | null = null;
let mySqlPool: MySqlPool | null = null;
let setupPromise: Promise<void> | null = null;

function getMigrationsDir(): string {
  return path.join(process.cwd(), 'src', 'db', 'migrations');
}

function getSeedsDir(): string {
  return path.join(process.cwd(), 'src', 'db', 'seeds');
}

function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let current = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && char === ',') {
      row.push(current);
      current = '';
      continue;
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') index += 1;
      if (current.length > 0 || row.length > 0) {
        row.push(current);
        rows.push(row);
      }
      current = '';
      row = [];
      continue;
    }

    current += char;
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current);
    rows.push(row);
  }

  return rows.filter((entry) => entry.some((cell) => cell.trim().length > 0));
}

function coerceSeedValue(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (/^-?\d+$/.test(trimmed)) return Number(trimmed);
  if (/^-?\d+\.\d+$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

function getBillingDbKindOrThrow(): BillingDbKind {
  const kind = getBillingDbKind();
  if (!kind) throw new Error('Billing database is not configured');
  return kind;
}

function normalizeMysqlParameters(text: string, values: unknown[]): { text: string; values: unknown[] } {
  const orderedValues: unknown[] = [];
  const converted = text.replace(/\$(\d+)/g, (_match, index) => {
    orderedValues.push(values[Number(index) - 1]);
    return '?';
  });
  return { text: converted, values: orderedValues };
}

function mapMysqlRows<T extends BillingQueryRow>(rows: RowDataPacket[]): T[] {
  return rows.map((row) => ({ ...row })) as T[];
}

export function getPgPool(): PgPool {
  if (getBillingDbKindOrThrow() !== 'postgres') {
    throw new Error('Billing database is not PostgreSQL');
  }
  if (!pgPool) {
    pgPool = new PgPool({ connectionString: env.DATABASE_URL });
  }
  return pgPool;
}

function getMySqlPool(): MySqlPool {
  if (getBillingDbKindOrThrow() !== 'mysql') {
    throw new Error('Billing database is not MySQL');
  }
  if (!mySqlPool) {
    if (env.DATABASE_URL.toLowerCase().startsWith('mysql://')) {
      mySqlPool = mysql.createPool({ uri: env.DATABASE_URL, waitForConnections: true, connectionLimit: 10, multipleStatements: true });
    } else {
      mySqlPool = mysql.createPool({
        host: env.MYSQL_HOST,
        port: Number(env.MYSQL_PORT || '3306'),
        database: env.MYSQL_DATABASE,
        user: env.MYSQL_USER,
        password: env.MYSQL_PASSWORD,
        waitForConnections: true,
        connectionLimit: 10,
        multipleStatements: true,
      });
    }
  }
  return mySqlPool;
}

async function getConnection(): Promise<BillingConnection> {
  const kind = getBillingDbKindOrThrow();
  if (kind === 'postgres') {
    const client = await getPgPool().connect();
    return {
      async query<T extends BillingQueryRow = BillingQueryRow>(text: string, values: unknown[] = []) {
        const result = await client.query<T>(text, values);
        return { rows: result.rows, rowCount: result.rowCount ?? result.rows.length };
      },
      release() {
        client.release();
      },
      async beginTransaction() {
        await client.query('BEGIN');
      },
      async commit() {
        await client.query('COMMIT');
      },
      async rollback() {
        await client.query('ROLLBACK');
      },
    };
  }

  const connection = await getMySqlPool().getConnection();
  return {
    async query<T extends BillingQueryRow = BillingQueryRow>(text: string, values: unknown[] = []) {
      const normalized = normalizeMysqlParameters(text, values);
      const [rows] = await connection.query(normalized.text, normalized.values);
      if (Array.isArray(rows)) {
        const mapped = mapMysqlRows<T>(rows as RowDataPacket[]);
        return { rows: mapped, rowCount: mapped.length };
      }
      const header = rows as { affectedRows?: number; insertId?: number };
      return { rows: [], rowCount: Number(header.affectedRows ?? 0), insertId: Number(header.insertId ?? 0) || undefined };
    },
    release() {
      connection.release();
    },
    async beginTransaction() {
      await connection.beginTransaction();
    },
    async commit() {
      await connection.commit();
    },
    async rollback() {
      await connection.rollback();
    },
  };
}

export async function withPgClient<T>(handler: (client: BillingConnection) => Promise<T>): Promise<T> {
  const client = await getConnection();
  try {
    return await handler(client);
  } finally {
    client.release();
  }
}

export async function queryPg<T extends BillingQueryRow = BillingQueryRow>(text: string, values: unknown[] = []): Promise<BillingQueryResult<T>> {
  await ensureBillingInfrastructure();
  return withPgClient((client) => client.query<T>(text, values));
}

function listMigrationFiles(kind: BillingDbKind): string[] {
  const files = fs.readdirSync(getMigrationsDir()).sort();
  return kind === 'mysql'
    ? files.filter((entry) => entry.endsWith('.mysql.sql'))
    : files.filter((entry) => entry.endsWith('.sql') && !entry.endsWith('.mysql.sql'));
}

function splitSqlStatements(sql: string): string[] {
  return sql.split(/;\s*\n/).map((statement) => statement.trim()).filter(Boolean);
}

async function ensureMigrationTable(client: BillingConnection, kind: BillingDbKind): Promise<void> {
  if (kind === 'mysql') {
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(191) PRIMARY KEY,
        applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );
    return;
  }

  await client.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
  );
}

export async function ensureBillingInfrastructure(): Promise<void> {
  if (!hasPostgresConfig()) return;
  if (!setupPromise) {
    setupPromise = (async () => {
      const kind = getBillingDbKindOrThrow();
      await withPgClient(async (client) => {
        await ensureMigrationTable(client, kind);

        const files = listMigrationFiles(kind);
        for (const fileName of files) {
          const existing = await client.query<{ version: string }>('SELECT version FROM schema_migrations WHERE version = $1', [fileName]);
          if (existing.rowCount > 0) continue;

          const sql = fs.readFileSync(path.join(getMigrationsDir(), fileName), 'utf-8');
          const statements = kind === 'mysql' ? splitSqlStatements(sql) : [sql];
          try {
            await client.beginTransaction?.();
            for (const statement of statements) {
              await client.query(statement);
            }
            await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [fileName]);
            await client.commit?.();
          } catch (error) {
            await client.rollback?.();
            throw error;
          }
        }

        await seedBillingReferenceData(client);
      });
    })();
  }
  await setupPromise;
}

async function seedTableIfEmpty(client: BillingConnection, tableName: string, fileName: string): Promise<void> {
  const existing = await client.query<{ count: number | string }>(`SELECT COUNT(*) AS count FROM ${tableName}`);
  if (Number(existing.rows[0]?.count ?? 0) > 0) return;

  const filePath = path.join(getSeedsDir(), fileName);
  const raw = fs.readFileSync(filePath, 'utf-8');
  const [header, ...rows] = parseCsv(raw);
  if (!header || rows.length === 0) return;

  const columns = header.map((cell) => cell.trim());
  for (const row of rows) {
    const values = columns.map((_, index) => coerceSeedValue(row[index] ?? ''));
    const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
    const kind = getBillingDbKindOrThrow();
    const insertSql = kind === 'mysql'
      ? `INSERT IGNORE INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`
      : `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;
    await client.query(insertSql, values);
  }
}

export async function seedBillingReferenceData(client?: BillingConnection): Promise<void> {
  if (!hasPostgresConfig()) return;
  const runner = async (dbClient: BillingConnection) => {
    await seedTableIfEmpty(dbClient, 'topup_offers', 'topup_offers.csv');
    await seedTableIfEmpty(dbClient, 'feature_flags', 'feature_flags.csv');
    await seedTableIfEmpty(dbClient, 'agent_price_rules', 'agent_price_rules.csv');
    await seedTableIfEmpty(dbClient, 'webhook_event_types', 'webhook_event_types.csv');
    await seedTableIfEmpty(dbClient, 'model_routing_rules', 'model_routing_rules.csv');
    await seedTableIfEmpty(dbClient, 'ui_messages', 'ui_messages.csv');
  };

  if (client) {
    await runner(client);
    return;
  }

  await withPgClient(runner);
}
