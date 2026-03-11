import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { getUserFromRequest } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { getAppStateDir } from '@/lib/app-state';

const STATE_DIR = getAppStateDir();
const FLAG_PATH = path.join(STATE_DIR, 'sending-paused.flag');

export async function POST(req: NextRequest) {
  try {
    const user = getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as { paused?: boolean; reason?: string };
    if (typeof body.paused !== 'boolean') {
      return NextResponse.json({ error: 'Missing paused flag' }, { status: 400 });
    }

    fs.mkdirSync(STATE_DIR, { recursive: true });

    if (body.paused) {
      const reason = (body.reason || 'Paused').trim();
      const stamp = new Date().toISOString();
      fs.writeFileSync(FLAG_PATH, `${reason}\n${stamp}\n${user.username}`);
    } else {
      if (fs.existsSync(FLAG_PATH)) {
        fs.unlinkSync(FLAG_PATH);
      }
    }

    const db = getDb();
    const ts = new Date().toISOString();
    const action = body.paused ? 'outreach_paused' : 'outreach_resumed';
    const detail = body.paused ? (body.reason || 'Outreach paused') : 'Outreach resumed';
    db.prepare('INSERT INTO activity_log (ts, action, detail, result) VALUES (?, ?, ?, ?)')
      .run(ts, action, detail, 'ok');

    return NextResponse.json({ paused: body.paused });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

