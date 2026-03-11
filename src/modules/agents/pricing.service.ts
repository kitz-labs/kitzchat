import { queryPg } from '@/config/db';

export async function calculateCreditsForUsage(agentCode: string, inputTokens: number, outputTokens: number): Promise<number> {
  const result = await queryPg<{
    pricing_mode: string;
    base_credits: string;
    input_token_factor: string;
    output_token_factor: string;
    min_charge: number;
  }>(
    `SELECT pricing_mode, base_credits, input_token_factor, output_token_factor, min_charge
     FROM agent_price_rules WHERE agent_code = $1`,
    [agentCode],
  );

  const row = result.rows[0];
  if (!row) {
    return Math.max(20, Math.ceil(inputTokens * 0.002 + outputTokens * 0.008));
  }

  if (row.pricing_mode === 'fixed') {
    return Math.max(row.min_charge, Math.round(Number(row.base_credits)));
  }

  const usageCredits = Math.ceil(inputTokens * Number(row.input_token_factor) + outputTokens * Number(row.output_token_factor));
  return Math.max(row.min_charge, usageCredits);
}
