import { NextResponse } from 'next/server';
import { authenticate, createSession, destroySession, getCustomerFreeMessageUsage, seedAdmin, setUserWalletBalanceCents, userHasAgentAccess, userHasFreeCustomerAccess, getUserFromRequest } from '@/lib/auth';
import { getAudienceFromAccountType } from '@/lib/app-audience';
import { ensureBillingUser, getWalletView, syncBillingWalletFromAppBalance } from '@/modules/wallet/wallet.service';
import { resolveCookieDomain } from '@/lib/cookies';
import { creditsToCents } from '@/config/env';

const SESSION_COOKIE = 'kitzchat-session';
const SESSION_MAX_AGE = 7 * 24 * 60 * 60;

function shouldUseSecureCookies(request: Request): boolean {
  const forced = process.env.AUTH_COOKIE_SECURE?.trim().toLowerCase();
  if (forced === 'true' || forced === '1' || forced === 'yes') return true;
  if (forced === 'false' || forced === '0' || forced === 'no') return false;
  const forwardedProto = request.headers.get('x-forwarded-proto');
  if (forwardedProto) {
    return forwardedProto.split(',')[0].trim().toLowerCase() === 'https';
  }

  try {
    return new URL(request.url).protocol === 'https:';
  } catch {
    return process.env.NODE_ENV === 'production';
  }
}

export async function POST(request: Request) {
  try { console.log('[auth/me] POST handler called', request.method, request.url); } catch {}
  try {
    seedAdmin();
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Auth configuration error' },
      { status: 500 },
    );
  }

  const { username, password } = await request.json();
  if (!username || !password) {
    return NextResponse.json({ error: 'Username and password required' }, { status: 400 });
  }

  const user = authenticate(username, password);
  if (!user) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const freeMessages = getCustomerFreeMessageUsage(user.id, user.username);

  let walletBalanceCredits = 0;
  let walletBalanceCentsFromBilling: number | null = null;
  try {
    await ensureBillingUser({
      userId: user.id,
      email: user.email ?? null,
      name: user.username,
      stripeCustomerId: user.stripe_customer_id ?? null,
      chatEnabled: user.payment_status === 'paid',
    });
    let wallet = await getWalletView(user.id);
    walletBalanceCredits = wallet.balance;
    if (walletBalanceCredits <= 0 && (user.wallet_balance_cents ?? 0) > 0) {
      await syncBillingWalletFromAppBalance({
        userId: user.id,
        walletBalanceCents: user.wallet_balance_cents ?? 0,
        reason: 'Auto-Sync beim Login (Billing-Wallet fehlte trotz Guthaben).',
      });
      wallet = await getWalletView(user.id);
      walletBalanceCredits = wallet.balance;
    }
    if (user.account_type === 'customer') {
      const cents = creditsToCents(Math.max(0, Number(walletBalanceCredits ?? 0)));
      walletBalanceCentsFromBilling = Number.isFinite(cents) ? cents : null;
      if (walletBalanceCentsFromBilling != null && Math.round(Number(user.wallet_balance_cents ?? 0)) !== Math.round(walletBalanceCentsFromBilling)) {
        setUserWalletBalanceCents(user.id, walletBalanceCentsFromBilling);
      }
    }
  } catch {
    walletBalanceCredits = 0;
  }

  const cookie = request.headers.get('cookie') || '';
  const existingMatch = cookie.match(/(?:^|;\s*)kitzchat-session=([^;]*)/);
  const existingToken = existingMatch ? decodeURIComponent(existingMatch[1]) : null;
  if (existingToken) {
    destroySession(existingToken);
  }

  const token = createSession(user.id);
  const response = NextResponse.json({
    app_audience: getAudienceFromAccountType(user.account_type),
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      account_type: user.account_type,
      payment_status: user.payment_status,
      has_agent_access: userHasAgentAccess(user) || userHasFreeCustomerAccess(user),
      email: user.email ?? null,
      plan_amount_cents: user.plan_amount_cents ?? 0,
      wallet_balance_cents: walletBalanceCentsFromBilling ?? (user.wallet_balance_cents ?? 0),
      wallet_balance_credits: walletBalanceCredits,
      onboarding_completed_at: user.onboarding_completed_at ?? null,
      next_topup_discount_percent: user.next_topup_discount_percent ?? 0,
      completed_payments_count: user.completed_payments_count ?? 0,
      accepted_terms_at: user.accepted_terms_at ?? null,
      free_messages_limit: freeMessages.limit,
      free_messages_used: freeMessages.used,
      free_messages_remaining: freeMessages.remaining,
    },
  });

  const secure = shouldUseSecureCookies(request);
  const domain = resolveCookieDomain(request);
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    maxAge: SESSION_MAX_AGE,
    path: '/',
    ...(domain ? { domain } : {}),
  });
  response.headers.set('Cache-Control', 'no-store');

  return response;
}

export async function GET(request: Request) {
  try { console.log('[auth/me] GET handler called', request.method, request.url, 'cookie-present:', Boolean(request.headers.get('cookie'))); } catch {}
  try {
    const user = getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const freeMessages = getCustomerFreeMessageUsage(user.id, user.username);

    let walletBalanceCredits = 0;
    let walletBalanceCentsFromBilling: number | null = null;
    try {
      await ensureBillingUser({
        userId: user.id,
        email: user.email ?? null,
        name: user.username,
        stripeCustomerId: user.stripe_customer_id ?? null,
        chatEnabled: user.payment_status === 'paid',
      });
      let wallet = await getWalletView(user.id);
      walletBalanceCredits = wallet.balance;
      if (walletBalanceCredits <= 0 && (user.wallet_balance_cents ?? 0) > 0) {
        await syncBillingWalletFromAppBalance({
          userId: user.id,
          walletBalanceCents: user.wallet_balance_cents ?? 0,
          reason: 'Auto-Sync bei /auth/me (Billing-Wallet fehlte trotz Guthaben).',
        });
        wallet = await getWalletView(user.id);
        walletBalanceCredits = wallet.balance;
      }
      if (user.account_type === 'customer') {
        const cents = creditsToCents(Math.max(0, Number(walletBalanceCredits ?? 0)));
        walletBalanceCentsFromBilling = Number.isFinite(cents) ? cents : null;
        if (walletBalanceCentsFromBilling != null && Math.round(Number(user.wallet_balance_cents ?? 0)) !== Math.round(walletBalanceCentsFromBilling)) {
          setUserWalletBalanceCents(user.id, walletBalanceCentsFromBilling);
        }
      }
    } catch {
      walletBalanceCredits = 0;
    }

    const response = NextResponse.json({
      app_audience: getAudienceFromAccountType(user.account_type),
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        account_type: user.account_type,
        payment_status: user.payment_status,
        has_agent_access: userHasAgentAccess(user) || userHasFreeCustomerAccess(user),
        email: user.email ?? null,
        plan_amount_cents: user.plan_amount_cents ?? 0,
        wallet_balance_cents: walletBalanceCentsFromBilling ?? (user.wallet_balance_cents ?? 0),
        wallet_balance_credits: walletBalanceCredits,
        onboarding_completed_at: user.onboarding_completed_at ?? null,
        next_topup_discount_percent: user.next_topup_discount_percent ?? 0,
        completed_payments_count: user.completed_payments_count ?? 0,
        accepted_terms_at: user.accepted_terms_at ?? null,
        free_messages_limit: freeMessages.limit,
        free_messages_used: freeMessages.used,
        free_messages_remaining: freeMessages.remaining,
      },
    });

    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Auth error' }, { status: 500 });
  }
}
