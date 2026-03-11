import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { createCheckoutSession } from '@/modules/billing/billing.service';
import { hasPostgresConfig } from '@/config/env';

export async function POST(request: Request) {
  try {
    const user = requireUser(request);
    const body = (await request.json().catch(() => ({}))) as { preset?: string; amountEur?: number };
    if (!hasPostgresConfig()) {
      return NextResponse.json({ error: 'DATABASE_URL fehlt. PostgreSQL-Billing ist noch nicht aktiv.' }, { status: 503 });
    }
    const result = await createCheckoutSession({
      userId: user.id,
      email: user.email ?? null,
      name: user.username,
      stripeCustomerId: user.stripe_customer_id ?? null,
      preset: body.preset,
      amountEur: body.amountEur,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Checkout failed';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (message.startsWith('amount_out_of_range')) {
      const [, min, max] = message.split(':');
      return NextResponse.json({ error: `Betrag muss zwischen ${min} und ${max} EUR liegen` }, { status: 400 });
    }
    return NextResponse.json({ error: 'Checkout failed' }, { status: 500 });
  }
}
