import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { getBillingDbKind, hasPostgresConfig } from '@/config/env';
import { queryPg } from '@/config/db';

export const dynamic = 'force-dynamic';

type TableRow = { table_name: string };

export async function GET(request: Request) {
  try {
    requireAdmin(request);
    if (!hasPostgresConfig()) {
      return NextResponse.json({ ok: true, tables: [] });
    }

    const kind = getBillingDbKind();
    if (kind === 'mysql') {
      const res = await queryPg<TableRow>(
        `SELECT table_name
         FROM information_schema.tables
         WHERE table_schema = DATABASE()
         ORDER BY table_name`,
      );
      return NextResponse.json({ ok: true, tables: res.rows.map((row) => row.table_name) });
    }

    const res = await queryPg<{ tablename: string }>(
      `SELECT tablename
       FROM pg_tables
       WHERE schemaname = 'public'
       ORDER BY tablename`,
    );

    return NextResponse.json({ ok: true, tables: res.rows.map((row) => row.tablename) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list tables';
    console.error('admin billing tables error:', message, error);
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (message === 'forbidden') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    return NextResponse.json({ ok: false, tables: [], error: 'Failed to list tables', detail: String(message).slice(0, 300) }, { status: 500 });
  }
}
