import { NextResponse } from 'next/server';
import { getCustomerFreeMessageUsage, getUserFromRequest, seedAdmin, userHasAgentAccess, userHasFreeCustomerAccess } from '@/lib/auth';
import { getAudienceFromAccountType } from '@/lib/app-audience';

export async function GET(request: Request) {
  try {
    seedAdmin();
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Auth configuration error' },
      { status: 500 },
    );
  }
  const user = getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const freeMessages = getCustomerFreeMessageUsage(user.id, user.username);
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
      wallet_balance_cents: user.wallet_balance_cents ?? 0,
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
}
