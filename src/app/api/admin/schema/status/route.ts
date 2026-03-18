import fs from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { getDb, getDbPath } from '@/lib/db';
import { ensureBillingInfrastructure, queryPg } from '@/config/db';
import { getBillingDbKind, hasPostgresConfig } from '@/config/env';

function listSqliteTables(): { name: string; count?: number }[] {
  const db = getDb();
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC")
    .all() as { name: string }[];
  return tables.map((t) => {
    try {
      const row = db.prepare(`SELECT COUNT(*) AS count FROM ${t.name}`).get() as { count?: number } | undefined;
      return { name: t.name, count: Number(row?.count ?? 0) };
    } catch {
      return { name: t.name };
    }
  });
}

function resolveMigrationsDir(): string | null {
  const candidates = [
    path.join(process.cwd(), 'src', 'db', 'migrations'),
    path.join(process.cwd(), '.next', 'standalone', 'src', 'db', 'migrations'),
    path.join(process.cwd(), '.next', 'standalone', 'server', 'src', 'db', 'migrations'),
  ];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) return candidate;
    } catch {
      // ignore
    }
  }
  return null;
}

function listBillingMigrationFiles(): string[] {
  const kind = getBillingDbKind();
  const dir = resolveMigrationsDir();
  if (!kind || !dir) return [];
  const files = fs.readdirSync(dir).sort();
  return kind === 'mysql'
    ? files.filter((entry) => entry.endsWith('.mysql.sql'))
    : files.filter((entry) => entry.endsWith('.sql') && !entry.endsWith('.mysql.sql'));
}

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  requireAdmin(request);

  const sqlitePath = getDbPath();
  const sqliteSizeBytes = (() => {
    try {
      return fs.statSync(sqlitePath).size;
    } catch {
      return null;
    }
  })();

  const sqliteTables = listSqliteTables();
  const sqliteVersion = (() => {
    try {
      const db = getDb();
      const row = db.prepare('select sqlite_version() as v').get() as { v?: string } | undefined;
      return row?.v ?? null;
    } catch {
      return null;
    }
  })();

  const billingConfigured = hasPostgresConfig();
  const billingKind = getBillingDbKind();
  let billingApplied: string[] = [];
  let billingPending: string[] = [];

  if (billingConfigured) {
    await ensureBillingInfrastructure();
    const rows = await queryPg<{ version: string }>('SELECT version FROM schema_migrations ORDER BY version ASC');
    billingApplied = rows.rows.map((r) => String(r.version));

    const files = listBillingMigrationFiles();
    const applied = new Set(billingApplied);
    billingPending = files.filter((f) => !applied.has(f));
  }

  return NextResponse.json({
    checked_at: new Date().toISOString(),
    sqlite: {
      path: sqlitePath,
      size_bytes: sqliteSizeBytes,
      sqlite_version: sqliteVersion,
      tables: sqliteTables,
    },
    billing: {
      configured: billingConfigured,
      kind: billingKind,
      schema_migrations_applied: billingApplied,
      schema_migrations_pending: billingPending,
      migrations_dir: resolveMigrationsDir(),
    },
  });
}

