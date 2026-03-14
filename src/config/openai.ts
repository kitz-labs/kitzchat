import { env, hasOpenAiConfig } from './env';
import type { AgentModelUsage } from '@/lib/agent-config';

export type OpenAiCreditBalance = {
  configured: boolean;
  creditsRemainingUsd: number | null;
  creditsUsedUsd: number | null;
  creditsGrantedUsd: number | null;
  note: string;
};

export type OpenAiResponse = {
  answer: string;
  inputTokens: number;
  outputTokens: number;
  openAiCostEur: number;
  modelInternal: string;
};

const COST_PER_1K_TOKENS: Record<string, number> = {
  'gpt-5.4': 0.012,
  'gpt-5': 0.012,
  'gpt-4.1': 0.006,
  'gpt-4.1-mini': 0.0035,
  'gpt-4o-mini': 0.0015,
  gpt_high: 0.012,
  gpt_mid: 0.0035,
  gpt_low: 0.0015,
};

function resolveApiModel(modelInternal: string): { apiModel: string; modelInternal: string } {
  if (modelInternal === 'gpt_high') return { apiModel: 'gpt-5', modelInternal: 'gpt-5.4' };
  if (modelInternal === 'gpt_mid') return { apiModel: 'gpt-4.1-mini', modelInternal: 'gpt-4.1-mini' };
  if (modelInternal === 'gpt_low') return { apiModel: 'gpt-4o-mini', modelInternal: 'gpt-4o-mini' };
  if (modelInternal === 'gpt-5.4') return { apiModel: 'gpt-5', modelInternal: 'gpt-5.4' };
  return { apiModel: modelInternal, modelInternal };
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function estimateCostEur(modelInternal: string, inputTokens: number, outputTokens: number): number {
  const per1k = COST_PER_1K_TOKENS[modelInternal] ?? COST_PER_1K_TOKENS.gpt_mid;
  return Number((((inputTokens + outputTokens) / 1000) * per1k).toFixed(6));
}

function getOpenAiHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    ...(env.OPENAI_ORG_ID ? { 'OpenAI-Organization': env.OPENAI_ORG_ID } : {}),
    ...(env.OPENAI_PROJECT ? { 'OpenAI-Project': env.OPENAI_PROJECT } : {}),
  };
}

function parseCreditBalance(payload: unknown): OpenAiCreditBalance | null {
  if (!payload || typeof payload !== 'object') return null;

  const record = payload as Record<string, unknown>;
  const totalGranted = Number(record.total_granted ?? record.granted ?? record.total_credits ?? 0);
  const totalUsed = Number(record.total_used ?? record.used ?? record.used_credits ?? 0);
  const totalAvailable = Number(record.total_available ?? record.available ?? record.available_credits ?? 0);

  if (![totalGranted, totalUsed, totalAvailable].some((value) => Number.isFinite(value) && value > 0)) {
    return null;
  }

  return {
    configured: true,
    creditsRemainingUsd: Number.isFinite(totalAvailable) ? totalAvailable : null,
    creditsUsedUsd: Number.isFinite(totalUsed) ? totalUsed : null,
    creditsGrantedUsd: Number.isFinite(totalGranted) ? totalGranted : null,
    note: 'OpenAI Billing API erfolgreich gelesen.',
  };
}

export async function fetchOpenAiCreditBalance(): Promise<OpenAiCreditBalance> {
  if (!hasOpenAiConfig()) {
    return {
      configured: false,
      creditsRemainingUsd: null,
      creditsUsedUsd: null,
      creditsGrantedUsd: null,
      note: 'Kein OpenAI-Key gefunden.',
    };
  }

  const endpoints = [
    'https://api.openai.com/v1/dashboard/billing/credit_grants',
    'https://api.openai.com/dashboard/billing/credit_grants',
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        headers: getOpenAiHeaders(),
        cache: 'no-store',
      });
      if (!response.ok) continue;
      const payload = await response.json().catch(() => null);
      const parsed = parseCreditBalance(payload);
      if (parsed) return parsed;
    } catch {
      // Try the next endpoint.
    }
  }

  return {
    configured: true,
    creditsRemainingUsd: null,
    creditsUsedUsd: null,
    creditsGrantedUsd: null,
    note: 'OpenAI Billing API ist mit diesem Key oder Setup nicht direkt lesbar.',
  };
}

export async function requestOpenAiResponse(prompt: string, modelInternal: string, modelUsage?: Partial<AgentModelUsage>): Promise<OpenAiResponse> {
  const resolvedModel = resolveApiModel(modelInternal);
  const inputTokens = estimateTokens(prompt);

  if (!hasOpenAiConfig()) {
    const answer = `Lokaler Premium-Vorschaumodus aktiv.\n\nIch habe deine Anfrage strukturiert erfasst und fuer die spaetere Live-OpenAI-Ausfuehrung vorbereitet:\n\n${prompt.slice(0, 1200)}`;
    const outputTokens = estimateTokens(answer);
    return {
      answer,
      inputTokens,
      outputTokens,
      openAiCostEur: estimateCostEur(resolvedModel.modelInternal, inputTokens, outputTokens),
      modelInternal: resolvedModel.modelInternal,
    };
  }

  const payload = {
    model: resolvedModel.apiModel,
    input: prompt,
    reasoning: modelUsage?.reasoningEffort ? { effort: modelUsage.reasoningEffort } : undefined,
    text: modelUsage?.maxOutputTokens ? { verbosity: modelUsage.reasoningEffort === 'high' ? 'high' : 'medium' } : undefined,
    max_output_tokens: modelUsage?.maxOutputTokens,
    temperature: typeof modelUsage?.temperature === 'number' ? modelUsage.temperature : undefined,
  };

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getOpenAiHeaders(),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed with ${response.status}`);
  }

  const data = (await response.json()) as {
    output_text?: string;
    usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
  };

  const answer = data.output_text?.trim() || 'Keine Antwort von OpenAI erhalten.';
  const resolvedInputTokens = Math.max(1, Number(data.usage?.input_tokens ?? inputTokens));
  const outputTokens = Math.max(1, Number(data.usage?.output_tokens ?? estimateTokens(answer)));

  return {
    answer,
    inputTokens: resolvedInputTokens,
    outputTokens,
    openAiCostEur: estimateCostEur(resolvedModel.modelInternal, resolvedInputTokens, outputTokens),
    modelInternal: resolvedModel.modelInternal,
  };
}
