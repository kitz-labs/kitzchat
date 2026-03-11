import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api-auth';
import { getDb } from '@/lib/db';
import { clampDays } from '@/lib/analytics';
import { summarizeCycleTimes, percentImprovement } from '@/lib/benchmarks';
import { maybeSeedExclude } from '@/lib/seed-filter';

export const dynamic = 'force-dynamic';

type CycleTimeRow = {
  cycle_hours: number;
};

function parseLaunchDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toIsoOrNull(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

function queryCycleTimes(
  request: Request,
  startIso: string,
  endIso: string,
): number[] {
  const db = getDb();
  const leadSeedFilter = maybeSeedExclude(request, 'leads', 'l.id');
  const seqSeedFilter = maybeSeedExclude(request, 'sequences', 's.id');
  const rows = db.prepare(
    `
      SELECT ((julianday(MIN(s.created_at)) - julianday(l.created_at)) * 24.0) AS cycle_hours
      FROM leads l
      JOIN sequences s ON s.lead_id = l.id
      WHERE s.status IN ('approved', 'queued')
        AND julianday(l.created_at) >= julianday(?)
        AND julianday(l.created_at) < julianday(?)
        ${leadSeedFilter}
        ${seqSeedFilter}
      GROUP BY l.id, l.created_at
    `,
  ).all(startIso, endIso) as CycleTimeRow[];

  return rows
    .map((r) => Number(r.cycle_hours))
    .filter((h) => Number.isFinite(h) && h >= 0);
}

export async function GET(req: NextRequest) {
  const auth = requireApiUser(req as Request);
  if (auth) return auth;

  const days = clampDays(req.nextUrl.searchParams.get('days'), 30);
  const now = new Date();
  const launchAt = parseLaunchDate(
    req.nextUrl.searchParams.get('launch_at') || process.env.KITZCHAT_BENCHMARK_LAUNCH_AT,
  );

  let beforeStart: Date;
  let beforeEnd: Date;
  let afterStart: Date;
  let afterEnd: Date;
  let baselineMode: 'rolling_window' | 'launch_anchored';

  if (launchAt) {
    baselineMode = 'launch_anchored';
    const dMs = days * 24 * 60 * 60 * 1000;
    beforeEnd = new Date(launchAt.getTime());
    beforeStart = new Date(launchAt.getTime() - dMs);
    afterStart = new Date(launchAt.getTime());
    const launchPlusWindow = new Date(launchAt.getTime() + dMs);
    afterEnd = launchPlusWindow.getTime() < now.getTime() ? launchPlusWindow : now;
  } else {
    baselineMode = 'rolling_window';
    const dMs = days * 24 * 60 * 60 * 1000;
    afterEnd = new Date(now.getTime());
    afterStart = new Date(now.getTime() - dMs);
    beforeEnd = new Date(afterStart.getTime());
    beforeStart = new Date(afterStart.getTime() - dMs);
  }

  const beforeValues = queryCycleTimes(req as Request, beforeStart.toISOString(), beforeEnd.toISOString());
  const afterValues = queryCycleTimes(req as Request, afterStart.toISOString(), afterEnd.toISOString());

  const beforeStats = summarizeCycleTimes(beforeValues.map((cycleHours) => ({ cycleHours })));
  const afterStats = summarizeCycleTimes(afterValues.map((cycleHours) => ({ cycleHours })));

  const medianDeltaPct = percentImprovement(beforeStats.medianHours, afterStats.medianHours);
  const p90DeltaPct = percentImprovement(beforeStats.p90Hours, afterStats.p90Hours);

  return NextResponse.json({
    metric: 'lead_to_approved_campaign_cycle_time_hours',
    days,
    baseline_mode: baselineMode,
    window: {
      before: { start: beforeStart.toISOString(), end: beforeEnd.toISOString() },
      after: { start: afterStart.toISOString(), end: afterEnd.toISOString() },
      now: now.toISOString(),
      launch_at: toIsoOrNull(launchAt),
    },
    before: beforeStats,
    after: afterStats,
    delta: {
      median_pct: medianDeltaPct,
      p90_pct: p90DeltaPct,
    },
    inclusion_rules: [
      'Lead cohort is based on lead.created_at within each window.',
      "Cycle time is MIN(sequence.created_at where sequence.status in ['approved','queued']) - lead.created_at.",
      'Only non-negative cycle times are counted.',
      'real=true excludes seeded records.',
    ],
  });
}
