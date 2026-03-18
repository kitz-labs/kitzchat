import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { hasPostgresConfig } from '@/config/env';
import { queryPg } from '@/config/db';
import { readSettings } from '@/lib/settings';
import { fetchOpenAiCompletionsUsage, fetchOpenAiCosts, getOpenAiAdminConfig } from '@/lib/openai-admin';
import { env } from '@/config/env';
import { fetchOpenAiCreditBalance } from '@/config/openai';

export const dynamic = 'force-dynamic';

function parseIsoDay(value: string | null): Date | null {
  if (!value) return null;
  const v = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function clampToRange(start: Date, endExclusive: Date): { start: Date; endExclusive: Date } {
  const s = new Date(start.getTime());
  const e = new Date(endExclusive.getTime());
  if (e.getTime() <= s.getTime()) {
    e.setTime(s.getTime() + 24 * 60 * 60 * 1000);
  }
  // Hard cap: 370 days to avoid huge API fetches.
  const maxMs = 370 * 24 * 60 * 60 * 1000;
  if (e.getTime() - s.getTime() > maxMs) {
    e.setTime(s.getTime() + maxMs);
  }
  return { start: s, endExclusive: e };
}

function toEpochSec(d: Date): number {
  return Math.floor(d.getTime() / 1000);
}

function formatIsoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function sumNumber(values: number[]): number {
  return values.reduce((acc, v) => acc + (Number.isFinite(v) ? v : 0), 0);
}

function normalizeUsdToEur(settingsValue: unknown, envValue: number): number {
  const n = typeof settingsValue === 'number' ? settingsValue : Number.NaN;
  const fromSettings = Number.isFinite(n) && n > 0 ? n : null;
  const fromEnv = Number.isFinite(envValue) && envValue > 0 ? envValue : 0.92;
  return fromSettings ?? fromEnv;
}

type OpenAiTopup = {
  id: string;
  purchased_at: string;
  amount_usd: number;
  note?: string;
  reference?: string;
};

function readOpenAiTopups(): OpenAiTopup[] {
  const s = readSettings();
  const arr = Array.isArray(s.openai?.prepaid_topups) ? s.openai!.prepaid_topups! : [];
  const cleaned = arr
    .filter((t) => t && typeof t.id === 'string' && typeof t.purchased_at === 'string')
    .map((t) => ({
      id: t.id,
      purchased_at: t.purchased_at,
      amount_usd: Number(t.amount_usd ?? 0),
      note: t.note,
      reference: t.reference,
    }))
    .filter((t) => Number.isFinite(t.amount_usd) && t.amount_usd > 0);
  cleaned.sort((a, b) => String(a.purchased_at).localeCompare(String(b.purchased_at)));
  return cleaned;
}

async function getInternalFinanceRange(start: Date, endExclusive: Date): Promise<{
  stripeRevenueEur: number;
  creditsIssued: number;
  walletBalanceCredits: number;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number; openaiCostEur: number };
  usageSeries: Array<{ day: string; inputTokens: number; outputTokens: number; totalTokens: number; openaiCostEur: number }>;
}> {
  if (!hasPostgresConfig()) {
    return {
      stripeRevenueEur: 0,
      creditsIssued: 0,
      walletBalanceCredits: 0,
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, openaiCostEur: 0 },
      usageSeries: [],
    };
  }

  const revenueRes = await queryPg<{ total: string; credits: string }>(
    `SELECT
       COALESCE(SUM(gross_amount_eur), 0) AS total,
       COALESCE(SUM(credits_issued), 0) AS credits
     FROM payments
     WHERE status = 'completed'
       AND created_at >= $1
       AND created_at < $2`,
    [start.toISOString(), endExclusive.toISOString()],
  );
  const stripeRevenueEur = Number(revenueRes.rows[0]?.total ?? 0);
  const creditsIssued = Number(revenueRes.rows[0]?.credits ?? 0);

  const walletRes = await queryPg<{ total: string }>(
    `SELECT COALESCE(SUM(balance_credits), 0) AS total
     FROM wallets`,
    [],
  );
  const walletBalanceCredits = Number(walletRes.rows[0]?.total ?? 0);

  const usageAgg = await queryPg<{ input_tokens: string; output_tokens: string; cost: string }>(
    `SELECT
       COALESCE(SUM(input_tokens), 0) AS input_tokens,
       COALESCE(SUM(output_tokens), 0) AS output_tokens,
       COALESCE(SUM(openai_cost_eur), 0) AS cost
     FROM usage_runs
     WHERE created_at >= $1
       AND created_at < $2`,
    [start.toISOString(), endExclusive.toISOString()],
  );
  const inputTokens = Number(usageAgg.rows[0]?.input_tokens ?? 0);
  const outputTokens = Number(usageAgg.rows[0]?.output_tokens ?? 0);
  const openaiCostEur = Number(usageAgg.rows[0]?.cost ?? 0);

  const usageSeriesRes = await queryPg<{ day: string; input_tokens: string; output_tokens: string; cost: string }>(
    `SELECT
       TO_CHAR(DATE_TRUNC('day', created_at), 'YYYY-MM-DD') AS day,
       COALESCE(SUM(input_tokens), 0) AS input_tokens,
       COALESCE(SUM(output_tokens), 0) AS output_tokens,
       COALESCE(SUM(openai_cost_eur), 0) AS cost
     FROM usage_runs
     WHERE created_at >= $1
       AND created_at < $2
     GROUP BY 1
     ORDER BY 1 ASC`,
    [start.toISOString(), endExclusive.toISOString()],
  );
  const usageSeries = usageSeriesRes.rows.map((r) => {
    const i = Number(r.input_tokens ?? 0);
    const o = Number(r.output_tokens ?? 0);
    return {
      day: String(r.day),
      inputTokens: i,
      outputTokens: o,
      totalTokens: i + o,
      openaiCostEur: Number(r.cost ?? 0),
    };
  });

  return {
    stripeRevenueEur,
    creditsIssued,
    walletBalanceCredits,
    usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens, openaiCostEur },
    usageSeries,
  };
}

export async function GET(request: Request) {
  try {
    requireAdmin(request);
    const url = new URL(request.url);

    const startParam = url.searchParams.get('start');
    const endParam = url.searchParams.get('end');

    const endDay = parseIsoDay(endParam) ?? new Date();
    const startDay = parseIsoDay(startParam) ?? new Date(endDay.getTime() - 29 * 24 * 60 * 60 * 1000);

    const endExclusive = new Date(`${formatIsoDay(endDay)}T00:00:00.000Z`);
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);

    const clamped = clampToRange(new Date(`${formatIsoDay(startDay)}T00:00:00.000Z`), endExclusive);
    const rangeStart = clamped.start;
    const rangeEndExclusive = clamped.endExclusive;

    const settings = readSettings();
    const topups = readOpenAiTopups();
    const usdToEur = normalizeUsdToEur(settings.openai?.usd_to_eur, env.OPENAI_USD_TO_EUR);

    const adminCfg = getOpenAiAdminConfig();
    const projectId = adminCfg.projectId;

    const internal = await getInternalFinanceRange(rangeStart, rangeEndExclusive);
    const creditBalance = await fetchOpenAiCreditBalance().catch(() => null);

    const topupsTotalUsd = sumNumber(topups.map((t) => t.amount_usd));
    const topupsRangeUsd = sumNumber(
      topups
        .filter((t) => {
          const ts = new Date(t.purchased_at).getTime();
          return ts >= rangeStart.getTime() && ts < rangeEndExclusive.getTime();
        })
        .map((t) => t.amount_usd),
    );

    let openaiCostsBuckets: any[] = [];
    let openaiUsageBuckets: any[] = [];
    let openaiCostsUsdRange = 0;
    let openaiCostsUsdToDate = 0;
    let openaiUsageTotals = { inputTokens: 0, outputTokens: 0, totalTokens: 0, numRequests: 0 };
    let costError: string | null = null;

    if (adminCfg.configured && projectId) {
      try {
        const startSec = toEpochSec(rangeStart);
        const endSec = toEpochSec(rangeEndExclusive);
        openaiCostsBuckets = await fetchOpenAiCosts({ startTimeSec: startSec, endTimeSec: endSec, projectId });
        openaiUsageBuckets = await fetchOpenAiCompletionsUsage({ startTimeSec: startSec, endTimeSec: endSec, projectId });

        openaiCostsUsdRange = sumNumber(
          openaiCostsBuckets.flatMap((b) =>
            Array.isArray(b?.results)
              ? b.results.map((r: any) => Number(r?.amount?.value ?? 0)).filter((n: number) => Number.isFinite(n))
              : [],
          ),
        );

        const usageRes = openaiUsageBuckets.flatMap((b) => (Array.isArray(b?.results) ? b.results : []));
        const input = sumNumber(usageRes.map((r: any) => Number(r?.input_tokens ?? 0)));
        const output = sumNumber(usageRes.map((r: any) => Number(r?.output_tokens ?? 0)));
        const total = sumNumber(usageRes.map((r: any) => Number(r?.total_tokens ?? 0)));
        const req = sumNumber(usageRes.map((r: any) => Number(r?.num_requests ?? 0)));
        openaiUsageTotals = {
          inputTokens: input,
          outputTokens: output,
          totalTokens: total || input + output,
          numRequests: req,
        };

        if (topups.length > 0) {
          const first = new Date(topups[0].purchased_at);
          const startAll = new Date(`${formatIsoDay(first)}T00:00:00.000Z`);
          const endAll = new Date(); // to "now" for balance
          const allBuckets = await fetchOpenAiCosts({
            startTimeSec: toEpochSec(startAll),
            endTimeSec: toEpochSec(endAll),
            projectId,
          });
          openaiCostsUsdToDate = sumNumber(
            allBuckets.flatMap((b) =>
              Array.isArray(b?.results)
                ? b.results.map((r: any) => Number(r?.amount?.value ?? 0)).filter((n: number) => Number.isFinite(n))
                : [],
            ),
          );
        }
      } catch (err) {
        costError = err instanceof Error ? err.message : String(err);
      }
    }

    const prepaidRemainingUsd = topupsTotalUsd > 0 ? Math.max(0, topupsTotalUsd - openaiCostsUsdToDate) : null;
    const overrideUsdRaw = settings.openai?.credit_balance_override_usd;
    const overrideUsd = Number.isFinite(Number(overrideUsdRaw)) ? Math.round(Number(overrideUsdRaw) * 100) / 100 : null;
    const openaiCreditUsd = creditBalance?.creditsRemainingUsd ?? overrideUsd ?? null;
    const creditSource = creditBalance?.creditsRemainingUsd != null ? 'api' : overrideUsd != null ? 'manual' : 'unknown';

    return NextResponse.json({
      ok: true,
      range: {
        start: formatIsoDay(rangeStart),
        end: formatIsoDay(new Date(rangeEndExclusive.getTime() - 1)),
        end_exclusive: rangeEndExclusive.toISOString(),
      },
      fx: {
        usd_to_eur: usdToEur,
        fixed: true,
      },
      config: {
        project_id: projectId,
        admin_key_configured: Boolean(env.OPENAI_ADMIN_KEY?.trim()),
        api_key_configured: Boolean(env.OPENAI_API_KEY?.trim()),
        webhook_secret_configured: Boolean(env.OPENAI_WEBHOOK_SECRET?.trim()),
        configured: Boolean(adminCfg.configured),
        webhook_url: '/api/openai/webhook',
      },
      openai: {
        credit_balance: {
          configured: creditBalance?.configured ?? false,
          source: creditSource,
          remaining_usd: openaiCreditUsd,
          remaining_eur: openaiCreditUsd !== null ? openaiCreditUsd * usdToEur : null,
          used_usd: creditBalance?.creditsUsedUsd ?? null,
          granted_usd: creditBalance?.creditsGrantedUsd ?? null,
          note: creditBalance?.creditsRemainingUsd != null
            ? (creditBalance?.note ?? 'OpenAI Credit Balance gelesen.')
            : overrideUsd != null
              ? 'Manuell gesetzt (kein API-Zugriff auf OpenAI Credit Balance).'
              : (creditBalance?.note ?? 'OpenAI Credit Balance nicht lesbar.'),
        },
        costs: {
          currency: 'usd',
          range_total_usd: openaiCostsUsdRange,
          range_total_eur: openaiCostsUsdRange * usdToEur,
          to_date_total_usd: openaiCostsUsdToDate,
          to_date_total_eur: openaiCostsUsdToDate * usdToEur,
          buckets_1d: openaiCostsBuckets,
          error: costError,
        },
        usage: {
          source: 'organization/usage/completions',
          totals: openaiUsageTotals,
          buckets_1d: openaiUsageBuckets,
        },
        prepaid: {
          topups_total_usd: topupsTotalUsd,
          topups_total_eur: topupsTotalUsd * usdToEur,
          topups_range_usd: topupsRangeUsd,
          topups_range_eur: topupsRangeUsd * usdToEur,
          remaining_usd: prepaidRemainingUsd,
          remaining_eur: prepaidRemainingUsd !== null ? prepaidRemainingUsd * usdToEur : null,
        },
        ledger: {
          topups,
        },
      },
      internal: {
        stripe_topups_eur: internal.stripeRevenueEur,
        credits_issued: internal.creditsIssued,
        wallet_balance_credits: internal.walletBalanceCredits,
        usage: internal.usage,
        usage_series_1d: internal.usageSeries,
      },
      comparison: {
        delta_eur: internal.stripeRevenueEur - (openaiCostsUsdRange * usdToEur),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load OpenAI overview';
    console.error('admin openai overview error:', message, error);
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (message === 'forbidden') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    return NextResponse.json({ error: 'Failed to load OpenAI overview', detail: String(message).slice(0, 300) }, { status: 500 });
  }
}
