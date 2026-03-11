import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { isRealMode } from '@/lib/seed-filter';
import { getAgents, ACTION_TO_AGENT } from '@/lib/agent-config';
import type { AgentStatus, AgentStats, ActivityEntry } from '@/types';
import fs from 'fs';
import path from 'path';
import { requireApiUser } from '@/lib/api-auth';
import { getInstance, resolveWorkspacePaths } from '@/lib/instances';

export const dynamic = 'force-dynamic';

interface AgentModelConfig {
  primary: string;
  fallbacks: string[];
}

interface UsageTotals {
  tokens_today: number;
  tokens_week: number;
  cost_today: number;
  cost_week: number;
}

function getInstanceIdFromRequest(req: NextRequest): string | null {
  try {
    const url = new URL(req.url);
    return url.searchParams.get('instance') || url.searchParams.get('namespace');
  } catch {
    return null;
  }
}

function getAgentModelRouting(workspaceConfigPath: string, agentId: string): AgentModelConfig | null {
  try {
    if (!fs.existsSync(workspaceConfigPath)) return null;
    const raw = fs.readFileSync(workspaceConfigPath, 'utf-8');
    const config = JSON.parse(raw) as {
      agents?: {
        defaults?: { model?: unknown };
        list?: Array<{ id?: string; model?: unknown }>;
      };
    };
    const defaults = config.agents?.defaults?.model;
    const list = config.agents?.list ?? [];
    const agent = list.find((a) => a.id === agentId);
    const selected = agent?.model ?? defaults;

    if (!selected) return null;

    if (typeof selected === 'string') {
      return { primary: selected, fallbacks: [] };
    }

    if (typeof selected === 'object' && selected !== null) {
      const model = selected as { primary?: unknown; fallbacks?: unknown };
      const primary = typeof model.primary === 'string' ? model.primary : null;
      const fallbacks = Array.isArray(model.fallbacks)
        ? model.fallbacks.filter((m): m is string => typeof m === 'string')
        : [];
      if (primary) return { primary, fallbacks };
    }
  } catch {
    return null;
  }
  return null;
}

function getUsageTotals(agentsDir: string, agentId: string): UsageTotals {
  const out: UsageTotals = {
    tokens_today: 0,
    tokens_week: 0,
    cost_today: 0,
    cost_week: 0,
  };

  const sessionsDir = path.join(agentsDir, agentId, 'sessions');
  if (!fs.existsSync(sessionsDir)) return out;

  const now = Date.now();
  const todayStr = new Date(now).toISOString().slice(0, 10);
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

  const files = fs.readdirSync(sessionsDir).filter((f) => f.endsWith('.jsonl'));
  for (const file of files) {
    const filePath = path.join(sessionsDir, file);
    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch {
      continue;
    }

    const lines = content.split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as {
          type?: string;
          timestamp?: string;
          message?: {
            role?: string;
            usage?: {
              totalTokens?: number;
              cost?: { total?: number };
            };
          };
        };
        if (entry.type !== 'message') continue;
        if (entry.message?.role !== 'assistant') continue;
        if (!entry.timestamp) continue;

        const ts = new Date(entry.timestamp).getTime();
        if (Number.isNaN(ts)) continue;

        const tokens = Math.max(0, Number(entry.message?.usage?.totalTokens ?? 0));
        const cost = Math.max(0, Number(entry.message?.usage?.cost?.total ?? 0));
        const date = entry.timestamp.slice(0, 10);

        if (date === todayStr) {
          out.tokens_today += tokens;
          out.cost_today += cost;
        }
        if (ts >= weekAgo) {
          out.tokens_week += tokens;
          out.cost_week += cost;
        }
      } catch {
        // ignore malformed lines
      }
    }
  }

  return out;
}

export async function GET(req: NextRequest) {
  const auth = requireApiUser(req as Request);
  if (auth) return auth;

  const instanceId = getInstanceIdFromRequest(req);
  const instance = getInstance(instanceId);
  const { workspaceConfigPath, agentsDir } = resolveWorkspacePaths(instance);

  const db = getDb();
  const now = Date.now();
  const excludeSeed = isRealMode(req);
  const sf = excludeSeed
    ? ` AND NOT EXISTS (SELECT 1 FROM seed_registry sr WHERE sr.table_name = 'activity_log' AND sr.record_id = CAST(activity_log.id AS TEXT))`
    : '';

  const agents = getAgents(instance.id).map((agent) => {
    // Get actions attributable to this agent
    const agentActions = Object.entries(ACTION_TO_AGENT)
      .filter(([, v]) => v.agent === agent.id)
      .map(([action]) => action);

    const placeholders = agentActions.map(() => '?').join(',');

    // Stats: today
    const today = new Date().toISOString().slice(0, 10);
    const todayCount =
      agentActions.length > 0
        ? (
            db
              .prepare(
                `SELECT COUNT(*) as c FROM activity_log WHERE action IN (${placeholders}) AND date(ts) = ?${sf}`,
              )
              .get(...agentActions, today) as { c: number }
          )?.c ?? 0
        : 0;

    // Stats: this week
    const weekCount =
      agentActions.length > 0
        ? (
            db
              .prepare(
                `SELECT COUNT(*) as c FROM activity_log WHERE action IN (${placeholders}) AND ts > datetime('now', '-7 days')${sf}`,
              )
              .get(...agentActions) as { c: number }
          )?.c ?? 0
        : 0;

    // Last activity
    const lastActivity =
      agentActions.length > 0
        ? (db
            .prepare(
              `SELECT action, detail, ts FROM activity_log WHERE action IN (${placeholders})${sf} ORDER BY ts DESC LIMIT 1`,
            )
            .get(...agentActions) as { action: string; detail: string; ts: string } | undefined)
        : undefined;

    // Top skills (by action count, last 30 days)
    const skillCounts =
      agentActions.length > 0
        ? (db
            .prepare(
              `SELECT action, COUNT(*) as c FROM activity_log
               WHERE action IN (${placeholders}) AND ts > datetime('now', '-30 days')${sf}
               GROUP BY action ORDER BY c DESC LIMIT 5`,
            )
            .all(...agentActions) as { action: string; c: number }[])
        : [];

    const topSkills = skillCounts.map((s) => ({
      skill: ACTION_TO_AGENT[s.action]?.skill || s.action,
      count: s.c,
    }));

    // Recent activity (last 10)
    const recentActivity =
      agentActions.length > 0
        ? (db
            .prepare(
              `SELECT id, ts, action, detail, result FROM activity_log
               WHERE action IN (${placeholders})${sf} ORDER BY ts DESC LIMIT 10`,
            )
            .all(...agentActions) as ActivityEntry[])
        : [];

    // Derive status
    let status: AgentStatus = 'planned';
    if (lastActivity?.ts) {
      const elapsed = now - new Date(lastActivity.ts).getTime();
      if (elapsed < 30 * 60 * 1000) status = 'active';
      else if (elapsed < 24 * 60 * 60 * 1000) status = 'idle';
    }

    const stats: AgentStats = {
      actions_today: todayCount,
      actions_week: weekCount,
      tokens_today: 0,
      tokens_week: 0,
      cost_today: 0,
      cost_week: 0,
      last_action: lastActivity?.detail || null,
      last_action_at: lastActivity?.ts || null,
      top_skills: topSkills,
    };

    const usage = getUsageTotals(agentsDir, agent.id);
    stats.tokens_today = usage.tokens_today;
    stats.tokens_week = usage.tokens_week;
    stats.cost_today = usage.cost_today;
    stats.cost_week = usage.cost_week;

    const modelRouting = getAgentModelRouting(workspaceConfigPath, agent.id);

    return {
      ...agent,
      model: modelRouting?.primary ?? agent.model,
      fallbacks: modelRouting?.fallbacks ?? agent.fallbacks,
      status,
      stats,
      recent_activity: recentActivity,
    };
  });

  return NextResponse.json(agents);
}

