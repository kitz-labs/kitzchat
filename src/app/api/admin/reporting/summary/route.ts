import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { hasPostgresConfig } from '@/config/env';
import { queryPg } from '@/config/db';

export const dynamic = 'force-dynamic';

function clampDays(raw: string | null | undefined, fallback = 30) {
  const parsed = Math.floor(Number(raw));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(365, parsed));
}

export async function GET(request: NextRequest) {
  try {
    requireAdmin(request as unknown as Request);
    if (!hasPostgresConfig()) return NextResponse.json({ error: 'DATABASE_URL fehlt' }, { status: 503 });

    const days = clampDays(request.nextUrl.searchParams.get('days'), 30);

    const totals = await queryPg<{
      total_paid_eur: string;
      total_credits_issued: string;
      payments_count: string;
    }>(
      `SELECT
         COALESCE(SUM(gross_amount_eur), 0) AS total_paid_eur,
         COALESCE(SUM(credits_issued), 0) AS total_credits_issued,
         COUNT(*) AS payments_count
       FROM payments
       WHERE status IN ('completed', 'paid')`,
    );

    const allocationTotals = await queryPg<{
      gross_amount_cents: string;
      usage_budget_cents: string;
      admin_share_cents: string;
    }>(
      `SELECT
         COALESCE(SUM(pa.gross_amount_cents), 0) AS gross_amount_cents,
         COALESCE(SUM(pa.usage_budget_cents), 0) AS usage_budget_cents,
         COALESCE(SUM(pa.admin_share_cents), 0) AS admin_share_cents
       FROM payment_allocations pa
       JOIN payments p ON p.id = pa.payment_id
       WHERE p.status IN ('completed', 'paid')`,
    );

    const usageTotals = await queryPg<{
      total_credits_used: string;
      openai_cost_eur: string;
      runs_count: string;
    }>(
      `SELECT
         COALESCE(SUM(credits_charged), 0) AS total_credits_used,
         COALESCE(SUM(openai_cost_eur), 0) AS openai_cost_eur,
         COUNT(*) AS runs_count
       FROM usage_runs
       WHERE status = 'completed'`,
    );

    const walletTotals = await queryPg<{ total_balance: string; wallets_count: string }>(
      `SELECT COALESCE(SUM(balance_credits), 0) AS total_balance, COUNT(*) AS wallets_count FROM wallets`,
    );

    const topAgents = await queryPg<{ agent_code: string; credits: string; runs: string }>(
      `SELECT agent_code, COALESCE(SUM(credits_charged), 0) AS credits, COUNT(*) AS runs
       FROM usage_runs
       WHERE status = 'completed'
         AND created_at > NOW() - ($1::int || ' days')::interval
       GROUP BY agent_code
       ORDER BY COALESCE(SUM(credits_charged), 0) DESC
       LIMIT 10`,
      [days],
    );

    const dailyUsage = await queryPg<{ date: string; credits: string; runs: string }>(
      `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS date,
              COALESCE(SUM(credits_charged), 0) AS credits,
              COUNT(*) AS runs
       FROM usage_runs
       WHERE status = 'completed'
         AND created_at > NOW() - ($1::int || ' days')::interval
       GROUP BY 1
       ORDER BY 1 ASC`,
      [days],
    );

    const dailyPayments = await queryPg<{ date: string; paid_eur: string; payments: string }>(
      `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS date,
              COALESCE(SUM(gross_amount_eur), 0) AS paid_eur,
              COUNT(*) AS payments
       FROM payments
       WHERE status IN ('completed', 'paid')
         AND created_at > NOW() - ($1::int || ' days')::interval
       GROUP BY 1
       ORDER BY 1 ASC`,
      [days],
    );

    const totalPaidEur = Number(totals.rows[0]?.total_paid_eur ?? 0);
    const totalCreditsIssued = Number(totals.rows[0]?.total_credits_issued ?? 0);
    const paymentsCount = Number(totals.rows[0]?.payments_count ?? 0);
    const grossAmountCents = Number(allocationTotals.rows[0]?.gross_amount_cents ?? 0);
    const totalUsageBudgetEur = Number((Number(allocationTotals.rows[0]?.usage_budget_cents ?? 0) / 100).toFixed(2));
    const totalAdminShareEur = Number((Number(allocationTotals.rows[0]?.admin_share_cents ?? 0) / 100).toFixed(2));
    const totalCreditsUsed = Number(usageTotals.rows[0]?.total_credits_used ?? 0);
    const openAiCostEur = Number(usageTotals.rows[0]?.openai_cost_eur ?? 0);
    const usageRunsCount = Number(usageTotals.rows[0]?.runs_count ?? 0);
    const totalBalanceCredits = Number(walletTotals.rows[0]?.total_balance ?? 0);
    const walletsCount = Number(walletTotals.rows[0]?.wallets_count ?? 0);

    return NextResponse.json({
      days,
      totals: {
        totalPaidEur,
        grossAmountCents,
        totalUsageBudgetEur,
        totalAdminShareEur,
        totalCreditsIssued,
        paymentsCount,
        totalCreditsUsed,
        usageRunsCount,
        openAiCostEur,
        totalBalanceCredits,
        walletsCount,
        estimatedGrossMarginEur: Number((totalPaidEur - openAiCostEur).toFixed(2)),
      },
      topAgents: topAgents.rows.map((row) => ({
        agent_code: row.agent_code,
        credits: Number(row.credits ?? 0),
        runs: Number(row.runs ?? 0),
      })),
      series: {
        dailyUsage: dailyUsage.rows.map((row) => ({ date: row.date, credits: Number(row.credits ?? 0), runs: Number(row.runs ?? 0) })),
        dailyPayments: dailyPayments.rows.map((row) => ({ date: row.date, paid_eur: Number(row.paid_eur ?? 0), payments: Number(row.payments ?? 0) })),
      },
      checked_at: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load reporting summary';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (message === 'forbidden') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    return NextResponse.json({ error: 'Failed to load reporting summary' }, { status: 500 });
  }
}
