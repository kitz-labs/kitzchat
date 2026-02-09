import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { maybeSeedExclude } from '@/lib/seed-filter';
import { writebackLeadUpdate, writebackSequenceStatus } from '@/lib/writeback';
import type { Lead, Sequence, FunnelStep } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const db = getDb();

  // Single lead detail
  if (id) {
    const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(id) as Lead | undefined;
    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    const sequences = db.prepare(
      'SELECT * FROM sequences WHERE lead_id = ? ORDER BY step ASC, created_at DESC'
    ).all(id) as Sequence[];

    // Build timeline from sequences + activity
    const timeline: { id: number; type: string; description: string; timestamp: string }[] = [];
    let timelineId = 0;

    for (const seq of sequences) {
      if (seq.sent_at) {
        timeline.push({
          id: ++timelineId,
          type: 'sequence_sent',
          description: `Email step ${seq.step}: "${seq.subject || 'No subject'}" sent`,
          timestamp: seq.sent_at,
        });
      } else if (seq.status === 'pending_approval') {
        timeline.push({
          id: ++timelineId,
          type: 'pending_approval',
          description: `Email step ${seq.step}: "${seq.subject || 'No subject'}" awaiting approval`,
          timestamp: seq.created_at,
        });
      } else if (seq.status === 'approved') {
        timeline.push({
          id: ++timelineId,
          type: 'approved',
          description: `Email step ${seq.step}: approved`,
          timestamp: seq.created_at,
        });
      }
    }

    if (lead.created_at) {
      timeline.push({
        id: ++timelineId,
        type: 'discovery',
        description: `Lead discovered via ${lead.source || 'unknown source'}`,
        timestamp: lead.created_at,
      });
    }

    timeline.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return NextResponse.json({ lead, sequences, timeline });
  }

  // List all leads with summary stats
  const status = searchParams.get('status');
  const tier = searchParams.get('tier');
  const search = searchParams.get('search');
  const seedExcludeLeads = maybeSeedExclude(request, 'leads');

  let sql = `SELECT * FROM leads WHERE 1=1${seedExcludeLeads}`;
  const params: unknown[] = [];

  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (tier) { sql += ' AND tier = ?'; params.push(tier); }
  if (search) {
    sql += ' AND (first_name LIKE ? OR last_name LIKE ? OR company LIKE ? OR email LIKE ?)';
    const like = `%${search}%`;
    params.push(like, like, like, like);
  }

  sql += ' ORDER BY score DESC, created_at DESC';
  const leads = db.prepare(sql).all(...params) as Lead[];

  const stages = ['new', 'validated', 'contacted', 'replied', 'interested', 'booked', 'qualified', 'disqualified'];
  const funnel: FunnelStep[] = stages.map(name => {
    const row = db.prepare(`SELECT COUNT(*) as c FROM leads WHERE status = ?${seedExcludeLeads}`).get(name) as { c: number };
    return { name, value: row?.c ?? 0 };
  });

  const totalLeads = (db.prepare(`SELECT COUNT(*) as c FROM leads WHERE 1=1${seedExcludeLeads}`).get() as { c: number })?.c ?? 0;
  const avgScore = (db.prepare(`SELECT AVG(score) as avg FROM leads WHERE score IS NOT NULL${seedExcludeLeads}`).get() as { avg: number | null })?.avg ?? 0;
  const tierBreakdown = db.prepare(
    `SELECT tier, COUNT(*) as c FROM leads WHERE tier IS NOT NULL${seedExcludeLeads} GROUP BY tier ORDER BY tier`
  ).all() as { tier: string; c: number }[];

  return NextResponse.json({
    leads,
    funnel,
    summary: {
      total: totalLeads,
      avg_score: Math.round(avgScore),
      tier_breakdown: tierBreakdown,
    },
  });
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, type, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 });
    }

    const db = getDb();

    // Sequence update (approve/reject)
    if (type === 'sequence') {
      const allowedStatuses = ['approved', 'cancelled', 'queued'];
      if (!updates.status || !allowedStatuses.includes(updates.status)) {
        return NextResponse.json({ error: 'Invalid sequence status' }, { status: 400 });
      }
      db.prepare('UPDATE sequences SET status = ? WHERE id = ?').run(updates.status, id);
      writebackSequenceStatus(id, updates.status);
      return NextResponse.json({ ok: true });
    }

    // Lead update
    const allowed = ['status', 'tier', 'notes', 'pause_outreach'];
    const cols: string[] = [];
    const params: unknown[] = [];

    for (const key of allowed) {
      if (updates[key] !== undefined) {
        if (key === 'pause_outreach') {
          cols.push(`${key} = ?`);
          params.push(updates[key] ? 1 : 0);
        } else {
          cols.push(`${key} = ?`);
          params.push(updates[key]);
        }
      }
    }

    if (cols.length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    cols.push("last_touch_at = datetime('now')");
    params.push(id);

    db.prepare(`UPDATE leads SET ${cols.join(', ')} WHERE id = ?`).run(...params);

    // Writeback to state file
    const writebackUpdates: Record<string, unknown> = {};
    for (const key of allowed) {
      if (updates[key] !== undefined) writebackUpdates[key] = updates[key];
    }
    writebackLeadUpdate(id, writebackUpdates);

    const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(id);
    return NextResponse.json({ ok: true, lead });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
