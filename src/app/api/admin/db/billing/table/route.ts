import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { getBillingDbKind, hasPostgresConfig } from '@/config/env';
import { queryPg } from '@/config/db';

export const dynamic = 'force-dynamic';

function normalizeTableName(name: string | null): string | null {
  const value = (name || '').trim();
  if (!value) return null;
  if (!/^[a-zA-Z0-9_]+$/.test(value)) return null;
  return value;
}

function quoteIdent(kind: string | null, value: string): string {
  return kind === 'mysql'
    ? `\`${value.replace(/`/g, '``')}\``
    : `"${value.replace(/"/g, '""')}"`;
}

type ColumnRow = {
  column_name: string;
  data_type: string;
};

export async function GET(request: Request) {
  try {
    requireAdmin(request);
    if (!hasPostgresConfig()) {
      return NextResponse.json({ ok: true, table: null, columns: [], rows: [], limit: 0, offset: 0, total: 0 });
    }

    const url = new URL(request.url);
    const name = normalizeTableName(url.searchParams.get('name'));
    const limit = Math.max(1, Math.min(200, Math.round(Number(url.searchParams.get('limit') || '50'))));
    const offset = Math.max(0, Math.round(Number(url.searchParams.get('offset') || '0')));
    if (!name) return NextResponse.json({ error: 'Invalid table name' }, { status: 400 });

    const kind = getBillingDbKind();

    const tables = await (async () => {
      if (kind === 'mysql') {
        const res = await queryPg<{ table_name: string }>(
          `SELECT table_name
           FROM information_schema.tables
           WHERE table_schema = DATABASE()`,
        );
        return new Set(res.rows.map((row) => row.table_name));
      }
      const res = await queryPg<{ tablename: string }>(
        `SELECT tablename
         FROM pg_tables
         WHERE schemaname = 'public'`,
      );
      return new Set(res.rows.map((row) => row.tablename));
    })();

    if (!tables.has(name)) {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 });
    }

    const columnsRes = await (async () => {
      if (kind === 'mysql') {
        return queryPg<ColumnRow>(
          `SELECT COLUMN_NAME AS column_name, DATA_TYPE AS data_type
           FROM information_schema.columns
           WHERE table_schema = DATABASE() AND table_name = $1
           ORDER BY ORDINAL_POSITION`,
          [name],
        );
      }
      return queryPg<ColumnRow>(
        `SELECT column_name, data_type
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1
         ORDER BY ordinal_position`,
        [name],
      );
    })();

    const columns = columnsRes.rows ?? [];
    const columnNames = new Set(columns.map((c) => c.column_name));
    const orderKey = columnNames.has('created_at')
      ? 'created_at'
      : columnNames.has('id')
        ? 'id'
        : columns[0]?.column_name || null;

    const totalRes = await queryPg<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM ${quoteIdent(kind, name)}`,
    );
    const total = Math.max(0, Number(totalRes.rows[0]?.total ?? 0));

    const orderSql = orderKey ? ` ORDER BY ${quoteIdent(kind, orderKey)} DESC` : '';
    const rowsRes = await queryPg(
      `SELECT * FROM ${quoteIdent(kind, name)}${orderSql} LIMIT $1 OFFSET $2`,
      [limit, offset],
    );

    return NextResponse.json({
      ok: true,
      table: name,
      columns,
      rows: rowsRes.rows ?? [],
      limit,
      offset,
      total,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load table';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (message === 'forbidden') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    return NextResponse.json({ error: 'Failed to load table' }, { status: 500 });
  }
}

