import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// Lightweight endpoint — returns pending counts for nav badges
// Polled by nav-rail every 30s
export async function GET() {
  try {
    const db = getDb();

    const content = (db.prepare(
      `SELECT COUNT(*) as c FROM content_posts WHERE status = 'pending_approval'`
    ).get() as { c: number })?.c ?? 0;

    const outreach = (db.prepare(
      `SELECT COUNT(*) as c FROM sequences WHERE status = 'pending_approval'`
    ).get() as { c: number })?.c ?? 0;

    const signals_today = (db.prepare(
      `SELECT COUNT(*) as c FROM signals WHERE date = date('now')`
    ).get() as { c: number })?.c ?? 0;

    const unread_notifications = (db.prepare(
      `SELECT COUNT(*) as c FROM notifications WHERE read = 0`
    ).get() as { c: number })?.c ?? 0;

    const new_leads = (db.prepare(
      `SELECT COUNT(*) as c FROM leads WHERE status = 'new'`
    ).get() as { c: number })?.c ?? 0;

    return NextResponse.json({
      content,
      outreach,
      signals_today,
      unread_notifications,
      new_leads,
      // Combined for automations page badge
      total_pending: content + outreach,
    });
  } catch {
    return NextResponse.json({
      content: 0, outreach: 0, signals_today: 0,
      unread_notifications: 0, new_leads: 0, total_pending: 0,
    });
  }
}
