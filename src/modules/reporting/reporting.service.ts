import { queryPg } from '@/config/db';

export async function getCustomerReporting(userId: number) {
  const payments = await queryPg<{
    total_paid_eur: string;
    total_credits_issued: string;
  }>(
      `SELECT COALESCE(SUM(gross_amount_eur), 0) AS total_paid_eur,
        COALESCE(SUM(credits_issued), 0) AS total_credits_issued
     FROM payments WHERE user_id = $1 AND status IN ('paid', 'refunded')`,
    [userId],
  );
  const usage = await queryPg<{
    total_credits_used: string;
    openai_cost_eur: string;
  }>(
      `SELECT COALESCE(SUM(credits_charged), 0) AS total_credits_used,
        COALESCE(SUM(openai_cost_eur), 0) AS openai_cost_eur
     FROM usage_runs WHERE user_id = $1 AND status = 'completed'`,
    [userId],
  );
  const allocations = await queryPg<{
    api_budget_eur: string;
    reserve_eur: string;
  }>(
    `SELECT COALESCE(SUM(pa.api_budget_eur), 0) AS api_budget_eur,
            COALESCE(SUM(pa.reserve_eur), 0) AS reserve_eur
     FROM payment_allocations pa
     JOIN payments p ON p.id = pa.payment_id
     WHERE p.user_id = $1`,
    [userId],
  );
  const wallet = await queryPg<{ balance_credits: string }>('SELECT balance_credits FROM wallets WHERE user_id = $1', [userId]);
  const routing = await queryPg<{ model_display_mode: string }>(
    `SELECT model_display_mode FROM usage_runs WHERE user_id = $1 AND status = 'completed'
     ORDER BY created_at DESC LIMIT 10`,
    [userId],
  );

  const totalPaidEur = Number(payments.rows[0]?.total_paid_eur ?? 0);
  const openAiCostEur = Number(usage.rows[0]?.openai_cost_eur ?? 0);
  const reserveEur = Number(allocations.rows[0]?.reserve_eur ?? 0);
  return {
    totalPaidEur,
    totalCreditsIssued: Number(payments.rows[0]?.total_credits_issued ?? 0),
    totalCreditsUsed: Number(usage.rows[0]?.total_credits_used ?? 0),
    currentBalance: Number(wallet.rows[0]?.balance_credits ?? 0),
    openaiCostEur: openAiCostEur,
    internalApiBudgetEur: Number(allocations.rows[0]?.api_budget_eur ?? 0),
    internalReserveEur: reserveEur,
    estimatedMarginEur: Number((totalPaidEur - openAiCostEur - reserveEur).toFixed(2)),
    lastRoutingModes: routing.rows.map((row) => row.model_display_mode),
  };
}
