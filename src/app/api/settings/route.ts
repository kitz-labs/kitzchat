import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSeedCount } from '@/lib/queries';
import fs from 'fs';
import path from 'path';

const DB_PATH = process.env.HERMES_DB_PATH || path.join(process.cwd(), 'hermes.db');
const STATE_DIR = process.env.HERMES_STATE_DIR || '/home/leads/workspace/state';

const TABLE_NAMES = [
  'content_posts', 'leads', 'sequences', 'suppression',
  'engagements', 'signals', 'experiments', 'learnings',
  'daily_metrics', 'activity_log', 'notifications',
];

export async function GET() {
  try {
    const db = getDb();

    // Get DB file size
    let db_size_mb = 0;
    try {
      const stat = fs.statSync(DB_PATH);
      db_size_mb = stat.size / (1024 * 1024);
    } catch {
      // file might not exist yet
    }

    // Get row counts for each table
    const tables = TABLE_NAMES.map(name => {
      try {
        const row = db.prepare(`SELECT COUNT(*) as c FROM ${name}`).get() as { c: number };
        return { name, count: row?.c ?? 0 };
      } catch {
        return { name, count: 0 };
      }
    });

    const seed_count = getSeedCount();

    return NextResponse.json({
      db_path: DB_PATH,
      state_dir: STATE_DIR,
      db_size_mb,
      tables,
      last_sync: null, // could track this in a metadata table
      seed_count,
    });
  } catch {
    return NextResponse.json({ error: 'Failed to get settings' }, { status: 500 });
  }
}
