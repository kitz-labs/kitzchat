import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { createStripeClient } from '@/lib/stripe-client';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    requireAdmin(request);
    const stripe = createStripeClient();
    if (!stripe) return NextResponse.json({ configured: false, products: [], prices: [] });

    const [products, prices] = await Promise.all([
      stripe.products.list({ limit: 100, active: true }),
      stripe.prices.list({ limit: 100, active: true, expand: ['data.product'] }),
    ]);

    return NextResponse.json({
      configured: true,
      products: products.data.map((p) => ({
        id: p.id,
        name: p.name,
        active: p.active,
        description: p.description ?? null,
        default_price: typeof p.default_price === 'string' ? p.default_price : (p.default_price as any)?.id ?? null,
        metadata: p.metadata ?? {},
        created_at: p.created ? new Date(p.created * 1000).toISOString() : null,
      })),
      prices: prices.data.map((price) => ({
        id: price.id,
        active: price.active,
        currency: price.currency,
        unit_amount: price.unit_amount,
        type: price.type,
        recurring: price.recurring ?? null,
        product_id: typeof price.product === 'string' ? price.product : (price.product as any)?.id ?? null,
        product_name: typeof price.product === 'string' ? null : (price.product as any)?.name ?? null,
        nickname: price.nickname ?? null,
        lookup_key: price.lookup_key ?? null,
        metadata: price.metadata ?? {},
        created_at: price.created ? new Date(price.created * 1000).toISOString() : null,
      })),
      checked_at: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load Stripe products';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (message === 'forbidden') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    return NextResponse.json({ error: 'Failed to load Stripe products' }, { status: 500 });
  }
}
