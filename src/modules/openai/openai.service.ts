import OpenAI from 'openai';
import { env, hasOpenAiWebhookConfig } from '@/config/env';

export type OpenAiWebhookEvent = {
  id?: string;
  type: string;
  data?: unknown;
};

let cachedClient: OpenAI | null = null;

function getOpenAiClient(): OpenAI {
  if (!hasOpenAiWebhookConfig()) {
    throw new Error('openai_webhook_not_configured');
  }

  if (!cachedClient) {
    cachedClient = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
      organization: env.OPENAI_ORG_ID || undefined,
      project: env.OPENAI_PROJECT || undefined,
      webhookSecret: env.OPENAI_WEBHOOK_SECRET,
    });
  }

  return cachedClient;
}

function getNestedString(source: unknown, key: string): string | null {
  if (!source || typeof source !== 'object') return null;

  let current: unknown = source;
  for (const segment of key.split('.')) {
    if (!current || typeof current !== 'object' || !(segment in current)) {
      return null;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  return typeof current === 'string' ? current : null;
}

export async function unwrapOpenAiWebhook(payload: string, requestHeaders: Headers): Promise<OpenAiWebhookEvent> {
  return (await getOpenAiClient().webhooks.unwrap(payload, requestHeaders)) as OpenAiWebhookEvent;
}

export async function processOpenAiWebhookEvent(event: OpenAiWebhookEvent): Promise<{ processed: boolean }> {
  console.info('[openai:webhook] processing event', {
    eventId: event.id ?? null,
    eventType: event.type,
  });

  if (event.type === 'response.completed') {
    console.info('[openai:webhook] response completed', {
      eventId: event.id ?? null,
      responseId: getNestedString(event.data, 'id'),
      status: getNestedString(event.data, 'status'),
    });
  } else if (event.type === 'response.failed') {
    console.warn('[openai:webhook] response failed', {
      eventId: event.id ?? null,
      responseId: getNestedString(event.data, 'id'),
      status: getNestedString(event.data, 'status'),
      errorCode: getNestedString(event.data, 'error.code'),
      errorMessage: getNestedString(event.data, 'error.message'),
    });
  } else {
    console.info('[openai:webhook] unhandled event type', {
      eventId: event.id ?? null,
      eventType: event.type,
    });
  }

  return { processed: true };
}