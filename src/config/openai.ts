import { env, hasOpenAiConfig } from './env';

export type OpenAiResponse = {
  answer: string;
  inputTokens: number;
  outputTokens: number;
  openAiCostEur: number;
  modelInternal: string;
};

const COST_PER_1K_TOKENS: Record<string, number> = {
  gpt_high: 0.012,
  gpt_mid: 0.004,
  gpt_low: 0.0015,
};

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function estimateCostEur(modelInternal: string, inputTokens: number, outputTokens: number): number {
  const per1k = COST_PER_1K_TOKENS[modelInternal] ?? COST_PER_1K_TOKENS.gpt_mid;
  return Number((((inputTokens + outputTokens) / 1000) * per1k).toFixed(6));
}

export async function requestOpenAiResponse(prompt: string, modelInternal: string): Promise<OpenAiResponse> {
  const inputTokens = estimateTokens(prompt);

  if (!hasOpenAiConfig()) {
    const answer = `Lokaler Premium-Vorschaumodus aktiv.\n\nIch habe deine Anfrage strukturiert erfasst und fuer die spaetere Live-OpenAI-Ausfuehrung vorbereitet:\n\n${prompt.slice(0, 1200)}`;
    const outputTokens = estimateTokens(answer);
    return {
      answer,
      inputTokens,
      outputTokens,
      openAiCostEur: estimateCostEur(modelInternal, inputTokens, outputTokens),
      modelInternal,
    };
  }

  const payload = {
    model: modelInternal === 'gpt_high' ? 'gpt-4.1' : modelInternal === 'gpt_low' ? 'gpt-4o-mini' : 'gpt-4.1-mini',
    input: prompt,
  };

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      ...(env.OPENAI_ORG_ID ? { 'OpenAI-Organization': env.OPENAI_ORG_ID } : {}),
      ...(env.OPENAI_PROJECT ? { 'OpenAI-Project': env.OPENAI_PROJECT } : {}),
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
    openAiCostEur: estimateCostEur(modelInternal, resolvedInputTokens, outputTokens),
    modelInternal,
  };
}
