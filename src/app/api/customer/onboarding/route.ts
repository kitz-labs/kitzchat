import { NextResponse } from 'next/server';
import { completeCustomerOnboarding, requireUser } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const user = requireUser(request);
    if (user.account_type !== 'customer') {
      return NextResponse.json({ error: 'Customer access required' }, { status: 403 });
    }
    if (!user.accepted_terms_at) {
      return NextResponse.json({ error: 'Bitte akzeptiere zuerst Nutzungshinweise und Datenschutz.' }, { status: 409 });
    }

    completeCustomerOnboarding(user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update onboarding';
    if (message === 'unauthorized') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to update onboarding' }, { status: 500 });
  }
}
