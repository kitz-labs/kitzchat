import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

type IncidentRow = {
  id: number;
  type: string;
  severity: string;
  title: string | null;
  message: string;
  data: string | null;
  read: number;
  created_at: string;
};

export async function GET(request: NextRequest) {
  try {
    requireAdmin(request as Request);
    const db = getDb();
    const filter = request.nextUrl.searchParams.get('filter');
    const limit = Math.max(1, Math.min(200, Number(request.nextUrl.searchParams.get('limit')) || 100));

    let sql = "SELECT id, type, severity, title, message, data, read, created_at FROM notifications WHERE type IN ('policy-violation', 'danger')";
    const params: unknown[] = [];

    if (filter === 'danger' || filter === 'policy-violation') {
      sql += ' AND type = ?';
      params.push(filter);
    }

    sql += ' ORDER BY created_at DESC, id DESC LIMIT ?';
    params.push(limit);

    const rows = db.prepare(sql).all(...params) as IncidentRow[];
    const incidents = rows.map((row) => ({
      ...row,
      read: row.read === 1,
      data: row.data ? JSON.parse(row.data) : null,
    }));

    const summary = db.prepare(
      `SELECT
        SUM(CASE WHEN type = 'danger' THEN 1 ELSE 0 END) AS danger_count,
        SUM(CASE WHEN type = 'policy-violation' THEN 1 ELSE 0 END) AS violation_count,
        SUM(CASE WHEN read = 0 THEN 1 ELSE 0 END) AS unread_count
       FROM notifications
       WHERE type IN ('policy-violation', 'danger')`,
    ).get() as { danger_count: number | null; violation_count: number | null; unread_count: number | null };

    return NextResponse.json({
      incidents,
      summary: {
        danger_count: summary?.danger_count ?? 0,
        violation_count: summary?.violation_count ?? 0,
        unread_count: summary?.unread_count ?? 0,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load incidents';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (message === 'forbidden') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    return NextResponse.json({ error: 'Failed to load incidents' }, { status: 500 });
  }
}