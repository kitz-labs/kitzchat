import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { createStripeClient } from '@/lib/stripe-client';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    requireAdmin(request);
    const stripe = createStripeClient();
    if (!stripe) return NextResponse.json({ configured: false, events: [] });

    const url = new URL(request.url);
    const type = url.searchParams.get('type')?.trim() || undefined;
    const limit = Math.max(1, Math.min(100, Math.round(Number(url.searchParams.get('limit') ?? '50'))));

    const events = await stripe.events.list({
      limit,
      ...(type ? { types: [type] as any } : {}),
    } as any);

    return NextResponse.json({
      configured: true,
      events: events.data.map((e) => {
        const obj: any = e.data?.object as any;
        const objectId = typeof obj?.id === 'string' ? obj.id : null;
        const objectType = typeof obj?.object === 'string' ? obj.object : null;
        return {
          id: e.id,
          type: e.type,
          created_at: e.created ? new Date(e.created * 1000).toISOString() : null,
          livemode: Boolean(e.livemode),
          api_version: (e as any).api_version ?? null,
          request_id: typeof (e as any).request?.id === 'string' ? (e as any).request.id : null,
          pending_webhooks: (e as any).pending_webhooks ?? null,
          object_id: objectId,
          object_type: objectType,
        };
      }),
      checked_at: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load Stripe events';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (message === 'forbidden') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    return NextResponse.json({ error: 'Failed to load Stripe events' }, { status: 500 });
  }
}

