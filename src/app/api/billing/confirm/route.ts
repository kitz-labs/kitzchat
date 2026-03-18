import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { applySimulatedCheckout, applySuccessfulCheckout, isCheckoutType, normalizeCheckoutAmount } from '@/lib/billing';
import { hasPostgresConfig } from '@/config/env';
import { getSessionStatus, recordSuccessfulPayment } from '@/modules/billing/billing.service';
import { confirmStripeSession } from '@/modules/stripe/stripe.service';
import { createStripeClient } from '@/lib/stripe-client';

export async function POST(request: NextRequest) {
  try {
    const user = requireUser(request as Request);
    const body = (await request.json().catch(() => ({}))) as { session_id?: string; mode?: string; checkout_type?: string; amount_cents?: number; credit_amount_cents?: number; discount_percent?: number };
    if (hasPostgresConfig()) {
      if (body.mode === 'dev') {
        if (process.env.NODE_ENV === 'production') {
          return NextResponse.json({ error: 'Unavailable' }, { status: 403 });
        }
        const checkoutType = isCheckoutType(body.checkout_type) ? body.checkout_type : 'topup';
        const amountCents = normalizeCheckoutAmount(checkoutType, body.amount_cents);
        const creditAmountCents = Math.max(0, Math.round(Number(body.credit_amount_cents ?? amountCents)));
        await recordSuccessfulPayment({
          userId: user.id,
          sessionId: body.session_id || `dev-${user.id}-${Date.now()}`,
          grossAmountEur: amountCents / 100,
          creditAmountCents,
          checkoutType,
          discountPercent: Number(body.discount_percent ?? 0),
          source: 'dev_confirm',
        });
        return NextResponse.json({ ok: true, status: 'paid' });
      }
      if (!body.session_id) return NextResponse.json({ error: 'session_id is required' }, { status: 400 });
      const session = await confirmStripeSession(body.session_id);
      const sessionUserId = Number(session.metadata?.user_id || 0);
      if (sessionUserId > 0 && sessionUserId !== user.id && user.role !== 'admin' && user.role !== 'editor') {
        return NextResponse.json({ error: 'Session gehoert zu einem anderen Kundenkonto' }, { status: 403 });
      }
      if (session.payment_status === 'paid' || session.status === 'complete') {
        const metadata = session.metadata || {};
        const fallbackAmountEur = (typeof session.amount_total === 'number' ? session.amount_total / 100 : 0) || Number(metadata.gross_amount || 0) || (Number(metadata.amount_cents || 0) / 100);
        const creditAmountCents = Number(metadata.credit_amount_cents || metadata.amount_cents || 0) || 0;
        const creditsMeta = Number(metadata.credits || 0) || 0;
        await recordSuccessfulPayment({
          userId: sessionUserId || user.id,
          sessionId: session.id,
          paymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : null,
          stripeCustomerId: typeof session.customer === 'string' ? session.customer : null,
          grossAmountEur: fallbackAmountEur,
          creditAmountCents: creditAmountCents > 0 ? creditAmountCents : undefined,
          creditsIssued: creditsMeta > 0 ? creditsMeta : undefined,
          checkoutType: isCheckoutType(metadata.checkout_type) ? metadata.checkout_type : undefined,
          discountPercent: Number(metadata.discount_percent || 0),
          source: 'session_confirm',
        });
      }
      return NextResponse.json(await getSessionStatus(body.session_id));
    }

    if (body.mode === 'dev') {
      if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Unavailable' }, { status: 403 });
      }
      const checkoutType = isCheckoutType(body.checkout_type) ? body.checkout_type : 'activation';
      const amountCents = normalizeCheckoutAmount(checkoutType, body.amount_cents);
      const creditAmountCents = normalizeCheckoutAmount(checkoutType, body.credit_amount_cents ?? body.amount_cents);
      const discountPercent = Math.max(0, Math.min(100, Math.round(Number(body.discount_percent || 0))));
      applySimulatedCheckout(user.id, checkoutType, amountCents, creditAmountCents, discountPercent);
      return NextResponse.json({ ok: true, status: 'paid' });
    }

    if (!body.session_id) {
      return NextResponse.json({ error: 'session_id is required' }, { status: 400 });
    }
    const stripe = createStripeClient();
    if (!stripe) {
      return NextResponse.json({ error: 'Stripe is not configured' }, { status: 503 });
    }
    const session = await stripe.checkout.sessions.retrieve(body.session_id);
    const sessionUserId = Number(session.metadata?.user_id || 0);
    if (sessionUserId > 0 && sessionUserId !== user.id && user.role !== 'admin' && user.role !== 'editor') {
      return NextResponse.json({ error: 'Session gehoert zu einem anderen Kundenkonto' }, { status: 403 });
    }
    const paid = session.payment_status === 'paid' || session.status === 'complete';
    if (!paid) {
      return NextResponse.json({ ok: false, status: session.payment_status || session.status || 'pending' });
    }
    applySuccessfulCheckout(session);
    return NextResponse.json({ ok: true, status: 'paid' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to confirm payment';
    if (message === 'unauthorized') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to confirm payment' }, { status: 500 });
  }
}
