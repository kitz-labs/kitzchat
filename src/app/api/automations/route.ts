import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getAgents, ACTION_TO_AGENT } from '@/lib/agent-config';
import type { ApprovalItem, SkillExecution } from '@/types';
import { requireApiUser } from '@/lib/api-auth';
import { getInstance, resolveWorkspacePaths } from '@/lib/instances';
import fs from 'node:fs';
import path from 'node:path';

export const dynamic = 'force-dynamic';

const DECISION_WINDOW_DAYS = 7;

type CronJob = {
  id?: string;
  payload?: { message?: string };
};

type CronRun = {
  ts?: number | string;
  summary?: string | null;
  error?: string | null;
  status?: string;
};

function getInstanceIdFromRequest(request: Request): string | null {
  try {
    const url = new URL(request.url);
    return url.searchParams.get('instance') || url.searchParams.get('namespace');
  } catch {
    return null;
  }
}

function readCronJobs(cronJobsPath: string): CronJob[] {
  try {
    const raw = fs.readFileSync(cronJobsPath, 'utf-8');
    const parsed = JSON.parse(raw) as { jobs?: CronJob[] };
    return Array.isArray(parsed.jobs) ? parsed.jobs : [];
  } catch {
    return [];
  }
}

function extractDecision(text: string): 'SCALE' | 'ITERATE' | 'KILL' | null {
  const m = text.match(/\b(SCALE|ITERATE|KILL)\b/i);
  if (!m) return null;
  return m[1].toUpperCase() as 'SCALE' | 'ITERATE' | 'KILL';
}

function readRecentRuns(cronRunsDir: string, jobId: string): CronRun[] {
  const file = path.join(cronRunsDir, `${jobId}.jsonl`);
  if (!fs.existsSync(file)) return [];
  try {
    const lines = fs.readFileSync(file, 'utf-8').split('\n').filter(Boolean);
    return lines.slice(-200)
      .map((line) => {
        try {
          return JSON.parse(line) as CronRun;
        } catch {
          return null;
        }
      })
      .filter((r): r is CronRun => !!r);
  } catch {
    return [];
  }
}

function computeExperimentInsights(cronJobsPath: string, cronRunsDir: string) {
  const jobs = readCronJobs(cronJobsPath);
  const total = jobs.length;
  const withContract = jobs.filter((j) => (j.payload?.message || '').includes('EXPERIMENT_CONTRACT:'));
  const withoutContract = jobs.filter((j) => !(j.payload?.message || '').includes('EXPERIMENT_CONTRACT:'));

  const cutoffMs = Date.now() - DECISION_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const counts = { SCALE: 0, ITERATE: 0, KILL: 0 };
  const recent: Array<{ job_id: string; ts: number; status: string; decision: 'SCALE' | 'ITERATE' | 'KILL'; snippet: string }> = [];

  for (const job of withContract) {
    const jobId = job.id;
    if (!jobId) continue;
    const runs = readRecentRuns(cronRunsDir, jobId);
    for (const run of runs) {
      const tsNum = typeof run.ts === 'number' ? run.ts : Number(new Date(run.ts || '').getTime());
      if (!Number.isFinite(tsNum) || tsNum < cutoffMs) continue;
      const text = `${run.summary || ''}\n${run.error || ''}`;
      const decision = extractDecision(text);
      if (!decision) continue;
      counts[decision] += 1;
      recent.push({
        job_id: jobId,
        ts: tsNum,
        status: run.status || 'unknown',
        decision,
        snippet: text.slice(0, 180),
      });
    }
  }

  recent.sort((a, b) => b.ts - a.ts);

  return {
    contract: {
      total_jobs: total,
      with_contract: withContract.length,
      without_contract: withoutContract.length,
      compliance_pct: total > 0 ? Math.round((withContract.length / total) * 100) : 0,
      missing_job_ids: withoutContract.map((j) => j.id || 'unknown').slice(0, 20),
    },
    decisions: {
      window_days: DECISION_WINDOW_DAYS,
      counts,
      recent: recent.slice(0, 12),
    },
  };
}

export async function GET(request: Request) {
  const auth = requireApiUser(request as Request);
  if (auth) return auth;
  const instance = getInstance(getInstanceIdFromRequest(request));
  const { cronDir } = resolveWorkspacePaths(instance);
  const cronJobsPath = path.join(cronDir, 'jobs.json');
  const cronRunsDir = path.join(cronDir, 'runs');
  const db = getDb();

  const pendingEmails = db.prepare(
    `SELECT s.id, s.subject, s.tier, s.status, s.created_at, l.first_name, l.last_name, l.company
     FROM sequences s LEFT JOIN leads l ON s.lead_id = l.id
     WHERE s.status = 'pending_approval'
     ORDER BY s.created_at DESC LIMIT 20`
  ).all() as { id: string; subject: string | null; tier: string | null; status: string; created_at: string; first_name: string | null; last_name: string | null; company: string | null }[];

  const approvals: ApprovalItem[] = [
    ...pendingEmails.map(e => ({
      id: e.id,
      type: 'email' as const,
      title: e.subject || 'No subject',
      preview: `To: ${e.first_name || ''} ${e.last_name || ''} at ${e.company || 'Unknown'}`,
      agent: 'apollo',
      created_at: e.created_at,
      tier: e.tier || undefined,
    })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const actionCounts = db.prepare(
    `SELECT action, COUNT(*) as c, MAX(ts) as last_run
     FROM activity_log
     WHERE ts > datetime('now', '-30 days') AND action IS NOT NULL
     GROUP BY action ORDER BY c DESC`
  ).all() as { action: string; c: number; last_run: string }[];

  const skillExecutions: SkillExecution[] = actionCounts
    .filter(a => ACTION_TO_AGENT[a.action])
    .map(a => ({
      skill: ACTION_TO_AGENT[a.action].skill,
      agent: ACTION_TO_AGENT[a.action].agent,
      count: a.c,
      last_run: a.last_run,
    }));

  const schedule = getAgents(instance.id).flatMap((agent) =>
    agent.cronJobs.map(job => ({
      ...job,
      agent: agent.id,
      agentName: agent.name,
      agentEmoji: agent.emoji,
    }))
  ).sort((a, b) => {
    const timeA = a.schedule.match(/(\d+):(\d+)/);
    const timeB = b.schedule.match(/(\d+):(\d+)/);
    if (!timeA || !timeB) return 0;
    return (parseInt(timeA[1]) * 60 + parseInt(timeA[2])) - (parseInt(timeB[1]) * 60 + parseInt(timeB[2]));
  });

  const today = new Date().toISOString().slice(0, 10);
  const hourlyActivity = db.prepare(
    `SELECT CAST(strftime('%H', ts) AS INTEGER) as hour, COUNT(*) as c
     FROM activity_log WHERE date(ts) = ?
     GROUP BY hour ORDER BY hour`
  ).all(today) as { hour: number; c: number }[];

  const experiment = computeExperimentInsights(cronJobsPath, cronRunsDir);

  return NextResponse.json({
    instance: instance.id,
    approvals,
    skill_executions: skillExecutions,
    schedule,
    hourly_activity: hourlyActivity,
    experiment,
    summary: {
      pending_approvals: approvals.length,
      total_executions_30d: skillExecutions.reduce((s, e) => s + e.count, 0),
      active_cron_jobs: schedule.length,
      experiment_compliance_pct: experiment.contract.compliance_pct,
      experiment_decisions_7d: experiment.decisions.counts.SCALE + experiment.decisions.counts.ITERATE + experiment.decisions.counts.KILL,
    },
  });
}
