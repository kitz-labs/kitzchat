import { randomUUID } from 'node:crypto';
import { requestOpenAiResponse } from '@/config/openai';
import { getEntitlements } from '@/modules/entitlements/entitlements.service';
import { calculateCreditsForUsage } from './pricing.service';
import { classifyTask, resolveModelRoute } from './model-routing.service';
import { applyWalletDelta, ensureBillingUser, getWalletView } from '@/modules/wallet/wallet.service';
import { queryPg } from '@/config/db';

export async function runAgentChat(params: {
  userId: number;
  email?: string | null;
  name: string;
  agentCode: string;
  prompt: string;
}): Promise<{
  answer: string;
  creditsCharged: number;
  remainingBalance: number;
  displayMode: string;
  requestId: string;
}> {
  await ensureBillingUser({ userId: params.userId, email: params.email, name: params.name, chatEnabled: true });
  const entitlements = await getEntitlements(params.userId);
  if (!entitlements.webchat || !entitlements.agents) {
    throw new Error('chat_not_enabled');
  }

  const wallet = await getWalletView(params.userId);
  if (wallet.balance <= 0) {
    throw new Error('insufficient_credits');
  }

  const classification = classifyTask(params.prompt, params.agentCode);
  const route = await resolveModelRoute({
    taskType: classification.taskType,
    promptSizeClass: classification.promptSizeClass,
    balanceRatio: wallet.balanceRatio,
  });

  const requestId = randomUUID();
  await queryPg(
    `INSERT INTO usage_runs
      (user_id, agent_code, request_id, status, model_internal, model_display_mode, routing_reason)
     VALUES ($1, $2, $3, 'started', $4, $5, $6)`,
    [params.userId, params.agentCode, requestId, route.preferredModel, route.displayMode, route.routingReason],
  );

  try {
    const response = await requestOpenAiResponse(params.prompt, route.preferredModel);
    const creditsCharged = await calculateCreditsForUsage(params.agentCode, response.inputTokens, response.outputTokens);
    const walletChange = await applyWalletDelta(params.userId, {
      entry_type: 'usage',
      credits_delta: -creditsCharged,
      reference_type: 'usage_run',
      reference_id: requestId,
      note: `${params.agentCode} · ${route.displayMode}`,
    });

    await queryPg(
      `UPDATE usage_runs
       SET status = 'completed', input_tokens = $1, output_tokens = $2, credits_charged = $3, openai_cost_eur = $4, model_internal = $5, model_display_mode = $6, routing_reason = $7
       WHERE request_id = $8`,
      [response.inputTokens, response.outputTokens, creditsCharged, response.openAiCostEur, response.modelInternal, route.displayMode, `${classification.routingReason}:${route.routingReason}`, requestId],
    );

    return {
      answer: response.answer,
      creditsCharged,
      remainingBalance: walletChange.balanceAfter,
      displayMode: route.displayMode,
      requestId,
    };
  } catch (error) {
    await queryPg('UPDATE usage_runs SET status = $1 WHERE request_id = $2', ['failed', requestId]);
    throw error;
  }
}
