import { queryPg } from '@/config/db';

export type TaskType = 'general' | 'complex' | 'image' | 'research' | 'short' | 'long';

export function classifyTask(input: string, agentCode: string): { taskType: TaskType; promptSizeClass: 'small' | 'large'; routingReason: string } {
  const lower = input.toLowerCase();
  const promptSizeClass = input.length > 1200 ? 'large' : 'small';

  if (agentCode.includes('research') || lower.includes('recherche') || lower.includes('analyse')) {
    return { taskType: 'complex', promptSizeClass, routingReason: 'research_or_analysis' };
  }
  if (lower.includes('bild') || lower.includes('image')) {
    return { taskType: 'image', promptSizeClass, routingReason: 'image_request' };
  }
  if (input.length > 800) {
    return { taskType: 'long', promptSizeClass, routingReason: 'long_prompt' };
  }
  if (input.length < 180) {
    return { taskType: 'short', promptSizeClass, routingReason: 'short_prompt' };
  }
  return { taskType: promptSizeClass === 'large' ? 'complex' : 'general', promptSizeClass, routingReason: 'default_classification' };
}

export async function resolveModelRoute(params: {
  taskType: TaskType;
  promptSizeClass: 'small' | 'large';
  balanceRatio: number;
}): Promise<{ preferredModel: string; fallbackModel: string; displayMode: string; routingReason: string }> {
  const normalizedTask = params.taskType === 'short' || params.taskType === 'long' ? 'general' : params.taskType;
  const result = await queryPg<{
    preferred_model: string;
    fallback_model: string;
    display_mode: string;
    rule_code: string;
  }>(
    `SELECT preferred_model, fallback_model, display_mode, rule_code
     FROM model_routing_rules
     WHERE active = TRUE
       AND task_type = $1
       AND prompt_size_class = $2
       AND $3 >= min_balance_ratio
       AND $3 <= max_balance_ratio
     ORDER BY priority ASC
     LIMIT 1`,
    [normalizedTask, params.promptSizeClass, Number(params.balanceRatio.toFixed(2))],
  );

  const row = result.rows[0];
  if (row) {
    return {
      preferredModel: row.preferred_model,
      fallbackModel: row.fallback_model,
      displayMode: row.display_mode,
      routingReason: row.rule_code,
    };
  }

  return {
    preferredModel: params.balanceRatio <= 0.2 ? 'gpt_low' : params.promptSizeClass === 'large' ? 'gpt_mid' : 'gpt_high',
    fallbackModel: 'gpt_low',
    displayMode: params.balanceRatio <= 0.2 ? 'efficient_premium' : 'premium_auto',
    routingReason: 'fallback_default',
  };
}
