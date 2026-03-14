import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { processOpenAiWebhookEvent, unwrapOpenAiWebhook } from '@/modules/openai/openai.service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const requestHeaders = new Headers(await headers());

    console.info('[openai:webhook] request received', {
      contentLength: rawBody.length,
      hasWebhookId: Boolean(requestHeaders.get('webhook-id')),
      hasWebhookTimestamp: Boolean(requestHeaders.get('webhook-timestamp')),
      hasWebhookSignature: Boolean(requestHeaders.get('webhook-signature')),
    });

    const event = await unwrapOpenAiWebhook(rawBody, requestHeaders);

    console.info('[openai:webhook] signature verified', {
      eventId: event.id ?? null,
      eventType: event.type,
    });

    await processOpenAiWebhookEvent(event);

    return NextResponse.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to process OpenAI webhook';
    console.error('[openai:webhook] processing failed', { message });

    if (message === 'openai_webhook_not_configured') {
      return NextResponse.json({ error: 'OpenAI webhook is not configured' }, { status: 503 });
    }

    if (message.toLowerCase().includes('signature')) {
      return NextResponse.json({ error: 'Invalid OpenAI webhook signature' }, { status: 400 });
    }

    return NextResponse.json({ error: 'Failed to process OpenAI webhook' }, { status: 500 });
  }
}