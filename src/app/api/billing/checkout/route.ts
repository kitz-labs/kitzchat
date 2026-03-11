import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { requireUser, userHasAgentAccess } from '@/lib/auth';
import { calculateDiscountedAmount, formatEuro, getCheckoutCopy, getNextTopupDiscountPercent, isCheckoutType, normalizeCheckoutAmount } from '@/lib/billing';
import { createCheckoutSession as createCreditCheckoutSession } from '@/modules/billing/billing.service';
import { hasPostgresConfig } from '@/config/env';

const PLAN_CURRENCY = 'eur';

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;
  return new Stripe(key);
}

export async function POST(request: Request) {
  try {
    const user = requireUser(request);
    const body = (await request.json().catch(() => ({}))) as { checkoutType?: string; amountCents?: number; returnPath?: string };
    const checkoutType = isCheckoutType(body.checkoutType) ? body.checkoutType : 'activation';
    const creditAmountCents = normalizeCheckoutAmount(checkoutType, body.amountCents);
    const discountPercent = checkoutType === 'topup' ? getNextTopupDiscountPercent(user) : 0;
    const amountCents = checkoutType === 'topup' ? calculateDiscountedAmount(creditAmountCents, discountPercent) : creditAmountCents;
    const returnPath = typeof body.returnPath === 'string' && body.returnPath.startsWith('/') ? body.returnPath : '/settings';
    if (user.role === 'admin' || user.role === 'editor') {
      return NextResponse.json({ error: 'Billing is not required for admin accounts' }, { status: 400 });
    }
    if (checkoutType === 'activation' && userHasAgentAccess(user)) {
      return NextResponse.json({ ok: true, status: 'paid', redirect_url: null });
    }
    if (checkoutType === 'topup' && !userHasAgentAccess(user)) {
      return NextResponse.json({ error: 'Activate agent access before loading more credit' }, { status: 400 });
    }

    if (hasPostgresConfig()) {
      const origin = request.headers.get('origin') || new URL(request.url).origin;
      const result = await createCreditCheckoutSession({
        userId: user.id,
        email: user.email ?? null,
        name: user.username,
        stripeCustomerId: user.stripe_customer_id ?? null,
        amountEur: creditAmountCents / 100,
        returnUrlBase: `${origin}${returnPath}`,
      });
      return NextResponse.json({
        ok: true,
        status: 'pending',
        redirect_url: result.checkoutUrl,
        amount_label: formatEuro(amountCents),
        credit_amount_label: `${result.creditsPreview.toLocaleString('de-DE')} Credits`,
        discount_percent: discountPercent,
      });
    }

    const origin = request.headers.get('origin') || new URL(request.url).origin;
    const stripe = getStripe();
    const priceId = process.env.STRIPE_PRICE_ID?.trim() || null;
    const checkoutCopy = getCheckoutCopy(checkoutType, amountCents);

    if (!stripe) {
      if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Stripe is not configured' }, { status: 503 });
      }
      return NextResponse.json({
        ok: true,
        status: 'paid',
        redirect_url: `${origin}${returnPath}?payment=success&mode=dev&checkout_type=${checkoutType}&amount_cents=${amountCents}&credit_amount_cents=${creditAmountCents}&discount_percent=${discountPercent}`,
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      success_url: `${origin}${returnPath}?payment=success&session_id={CHECKOUT_SESSION_ID}&checkout_type=${checkoutType}`,
      cancel_url: `${origin}${returnPath}?payment=cancelled&checkout_type=${checkoutType}`,
      line_items: [
        checkoutType === 'activation' && priceId
          ? {
              quantity: 1,
              price: priceId,
            }
          : {
              quantity: 1,
              price_data: {
                currency: PLAN_CURRENCY,
                unit_amount: amountCents,
                product_data: {
                  name: checkoutCopy.name,
                  description: checkoutCopy.description,
                },
              },
            },
      ],
      customer_email: user.email ?? undefined,
      metadata: {
        user_id: String(user.id),
        username: user.username,
        checkout_type: checkoutType,
        amount_cents: String(amountCents),
        credit_amount_cents: String(creditAmountCents),
        discount_percent: String(discountPercent),
      },
    });

    return NextResponse.json({
      ok: true,
      status: 'pending',
      redirect_url: session.url,
      amount_label: formatEuro(amountCents),
      credit_amount_label: formatEuro(creditAmountCents),
      discount_percent: discountPercent,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to start checkout';
    if (message === 'unauthorized') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to start checkout' }, { status: 500 });
  }
}