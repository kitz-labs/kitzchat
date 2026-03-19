import { randomUUID } from 'node:crypto';
import { requestOpenAiResponse } from '@/config/openai';
import { creditsToCents } from '@/config/env';
import { getUserById, setUserWalletBalanceCents } from '@/lib/auth';
import { getEntitlements } from '@/modules/entitlements/entitlements.service';
import { calculateCreditsForUsage } from './pricing.service';
import { classifyTask, resolveModelRoute } from './model-routing.service';
import { applyWalletDelta, ensureBillingUser, getWalletView, syncBillingWalletFromAppBalance } from '@/modules/wallet/wallet.service';
import { queryPg } from '@/config/db';
import { getAgent, type AgentDefinition } from '@/lib/agent-config';
import { getRecentCustomerMemorySnippet } from '@/lib/customer-memory';
import { buildCustomerAgentProfileSnippet } from '@/lib/customer-agent-profiles';

type CachedSnippet = { value: string; expiresAt: number };
const memorySnippetCache = new Map<number, CachedSnippet>();

function buildAgentRuntimePrompt(
  agent: AgentDefinition | undefined,
  userPrompt: string,
  opts: { memorySnippet: string; customerProfileSnippet: string; plainConversation?: boolean },
): string {
  if (!agent) return userPrompt;

  const policies = (agent.policies ?? []).map((p) => `- ${p}`).join('\n');
  const limits = (agent.limits ?? []).map((l) => `- ${l}`).join('\n');
  const tools = (agent.tools ?? []).map((t) => `- ${t}`).join('\n');
  const plainConversation = Boolean(opts.plainConversation);

  const ioSection = plainConversation
    ? [
        `# STYLE`,
        'Antworte immer als normale, menschliche Konversation.',
        'Keine Output-Format-Labels (A/B/C), keine Tabellen oder Checklisten, ausser der Nutzer fordert das explizit.',
        'Schreibe klar, freundlich und direkt.',
        '',
      ]
    : [
        `# IO`,
        `Input Format:\n${agent.inputFormat || ''}`.trim(),
        '',
        `Output Format:\n${agent.outputFormat || ''}`.trim(),
        '',
      ];

  const trimmedTools = tools.split('\n').slice(0, 8).join('\n');
  const trimmedPolicies = policies.split('\n').slice(0, 8).join('\n');
  const trimmedLimits = limits.split('\n').slice(0, 8).join('\n');

  return [
    `# SYSTEM`,
    agent.systemPrompt?.trim() || `Du bist ${agent.name}.`,
    ...(plainConversation
      ? [
          '',
          'WICHTIG: Ignoriere alle Output-Format-Vorgaben aus dem Agentenprofil. Antworte natuerlich wie im Chat.',
        ]
      : []),
    '',
    `# AGENT`,
    `id: ${agent.id}`,
    `role: ${agent.role}`,
    `model: ${agent.model}`,
    '',
    ...(opts.customerProfileSnippet ? [opts.customerProfileSnippet.trim(), ''] : []),
    ...(opts.memorySnippet ? [opts.memorySnippet.trim(), ''] : []),
    ...ioSection,
    `# TOOLS (allowed)`,
    (plainConversation ? trimmedTools : tools) || '- (none)',
    '',
    `# POLICIES`,
    (plainConversation ? trimmedPolicies : policies) || '- (none)',
    '',
    `# LIMITS`,
    (plainConversation ? trimmedLimits : limits) || '- (none)',
    '',
    `# USER`,
    userPrompt,
  ].join('\n');
}

export async function runAgentChat(params: {
  userId: number;
  email?: string | null;
  name: string;
  walletBalanceCents?: number;
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

  const appUser = getUserById(params.userId);
  const appWalletCents = Math.max(0, Math.round(params.walletBalanceCents ?? appUser?.wallet_balance_cents ?? 0));

  // Wenn Billing-Wallet leer ist, aber App-DB Guthaben vorhanden ist, synchronisieren wir einmalig hoch.
  try {
    const pre = await getWalletView(params.userId);
    if (pre.balance <= 0 && appWalletCents > 0) {
      await syncBillingWalletFromAppBalance({
        userId: params.userId,
        walletBalanceCents: appWalletCents,
        reason: 'Auto-Sync vor Chat (Billing-Wallet leer, App-DB hat Guthaben).',
      });
    }
  } catch {
    // ignore
  }

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
  const agentConfig = getAgent(undefined, params.agentCode);
  const preferredModel = wallet.balanceRatio <= 0.15 ? route.preferredModel : agentConfig?.model || route.preferredModel;
  const fallbackModel = agentConfig?.fallbacks?.[0] || route.fallbackModel;
  const runtimeUsage = agentConfig?.modelUsage;
  const cached = memorySnippetCache.get(params.userId);
  const now = Date.now();
  const memorySnippet = cached && cached.expiresAt > now
    ? cached.value
    : await getRecentCustomerMemorySnippet(params.userId, params.name, 2600).catch(() => '');
  if (!cached || cached.expiresAt <= now) {
    memorySnippetCache.set(params.userId, { value: memorySnippet, expiresAt: now + 25_000 });
  }
  const customerProfileSnippet = appUser?.account_type === 'customer'
    ? buildCustomerAgentProfileSnippet(params.userId, params.agentCode)
    : '';
  const runtimePrompt = buildAgentRuntimePrompt(agentConfig, params.prompt, {
    memorySnippet,
    customerProfileSnippet,
    // Customers get a more conversational style by default, but MailAgent must still output structured drafts.
    plainConversation: appUser?.account_type === 'customer' && params.agentCode !== 'mail-agent',
  });

  const requestId = randomUUID();
  await queryPg(
    `INSERT INTO usage_runs
      (user_id, agent_code, request_id, status, model_internal, model_display_mode, routing_reason)
     VALUES ($1, $2, $3, 'started', $4, $5, $6)`,
    [params.userId, params.agentCode, requestId, preferredModel, route.displayMode, route.routingReason],
  );

  try {
    let response;
    try {
      response = await requestOpenAiResponse(runtimePrompt, preferredModel, runtimeUsage);
    } catch (error) {
      if (fallbackModel && fallbackModel !== preferredModel) {
        response = await requestOpenAiResponse(runtimePrompt, fallbackModel, runtimeUsage);
      } else {
        throw error;
      }
    }
    const creditsCharged = await calculateCreditsForUsage(params.agentCode, response.inputTokens, response.outputTokens);
    const walletChange = await applyWalletDelta(params.userId, {
      entry_type: 'usage',
      credits_delta: -creditsCharged,
      reference_type: 'usage_run',
      reference_id: requestId,
      note: `${params.agentCode} · ${route.displayMode}`,
    });

    // SQLite is a UI/cache mirror only. After Billing-DB debit, mirror from the final Billing balance.
    if (appUser?.account_type === 'customer') {
      setUserWalletBalanceCents(params.userId, creditsToCents(walletChange.balanceAfter));
    }

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
