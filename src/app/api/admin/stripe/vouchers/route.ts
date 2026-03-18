import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { getAllowStripeWrite } from '@/lib/settings';
import { createStripeClient } from '@/lib/stripe-client';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    requireAdmin(request);
    const stripe = createStripeClient();
    if (!stripe) return NextResponse.json({ configured: false, coupons: [], promotion_codes: [] });

    const [coupons, promotionCodes] = await Promise.all([
      stripe.coupons.list({ limit: 100 }),
      stripe.promotionCodes.list({ limit: 100, expand: ['data.promotion.coupon'] }),
    ]);

    return NextResponse.json({
      configured: true,
      allow_write: getAllowStripeWrite(),
      coupons: coupons.data.map((c) => ({
        id: c.id,
        name: c.name ?? null,
        valid: c.valid,
        percent_off: c.percent_off ?? null,
        amount_off: c.amount_off ?? null,
        currency: c.currency ?? null,
        duration: c.duration,
        duration_in_months: c.duration_in_months ?? null,
        max_redemptions: c.max_redemptions ?? null,
        times_redeemed: c.times_redeemed ?? 0,
        redeem_by: c.redeem_by ? new Date(c.redeem_by * 1000).toISOString() : null,
        metadata: c.metadata ?? {},
        created_at: c.created ? new Date(c.created * 1000).toISOString() : null,
      })),
      promotion_codes: promotionCodes.data.map((p) => ({
        id: p.id,
        code: p.code,
        active: p.active,
        coupon_id: typeof p.promotion?.coupon === 'string' ? p.promotion.coupon : (p.promotion?.coupon as any)?.id ?? null,
        coupon_name: typeof p.promotion?.coupon === 'string' ? null : (p.promotion?.coupon as any)?.name ?? null,
        max_redemptions: p.max_redemptions ?? null,
        times_redeemed: p.times_redeemed ?? 0,
        expires_at: p.expires_at ? new Date(p.expires_at * 1000).toISOString() : null,
        restrictions: p.restrictions ?? null,
        metadata: p.metadata ?? {},
        created_at: p.created ? new Date(p.created * 1000).toISOString() : null,
      })),
      checked_at: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load Stripe vouchers';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (message === 'forbidden') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    return NextResponse.json({ error: 'Failed to load Stripe vouchers' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    requireAdmin(request);
    const stripe = createStripeClient();
    if (!stripe) return NextResponse.json({ error: 'Stripe is not configured' }, { status: 503 });
    if (!getAllowStripeWrite()) return NextResponse.json({ error: 'Stripe write disabled' }, { status: 403 });

    const body = (await request.json().catch(() => ({}))) as {
      coupon_name?: string;
      percent_off?: number;
      duration?: 'once' | 'repeating' | 'forever';
      duration_in_months?: number;
      promotion_code?: string;
      max_redemptions?: number;
      expires_at?: string;
    };

    const percentOff = Math.max(1, Math.min(100, Math.round(Number(body.percent_off ?? 0))));
    const duration = body.duration === 'forever' || body.duration === 'repeating' ? body.duration : 'once';
    const durationInMonths = duration === 'repeating' ? Math.max(1, Math.round(Number(body.duration_in_months ?? 1))) : undefined;

    const coupon = await stripe.coupons.create({
      name: body.coupon_name?.trim() || `Voucher ${percentOff}%`,
      percent_off: percentOff,
      duration,
      ...(durationInMonths ? { duration_in_months: durationInMonths } : {}),
      ...(Number.isFinite(Number(body.max_redemptions)) && Number(body.max_redemptions) > 0 ? { max_redemptions: Math.round(Number(body.max_redemptions)) } : {}),
    });

    const code = (body.promotion_code?.trim() || '').toUpperCase();
    if (!code) {
      return NextResponse.json({ ok: true, coupon_id: coupon.id, promotion_code_id: null });
    }

    const expiresAt = body.expires_at ? new Date(body.expires_at).getTime() : NaN;
    const expiresUnix = Number.isFinite(expiresAt) ? Math.floor(expiresAt / 1000) : undefined;

    const promo = await stripe.promotionCodes.create({
      promotion: { type: 'coupon', coupon: coupon.id },
      code,
      ...(expiresUnix ? { expires_at: expiresUnix } : {}),
      ...(Number.isFinite(Number(body.max_redemptions)) && Number(body.max_redemptions) > 0 ? { max_redemptions: Math.round(Number(body.max_redemptions)) } : {}),
    });

    return NextResponse.json({ ok: true, coupon_id: coupon.id, promotion_code_id: promo.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create voucher';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (message === 'forbidden') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    return NextResponse.json({ error: 'Failed to create voucher' }, { status: 500 });
  }
}
