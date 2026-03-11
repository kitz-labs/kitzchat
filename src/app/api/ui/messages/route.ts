import { NextRequest, NextResponse } from 'next/server';
import { getUiMessages } from '@/modules/billing/billing.service';
import { hasPostgresConfig } from '@/config/env';

export async function GET(request: NextRequest) {
  try {
    if (!hasPostgresConfig()) {
      return NextResponse.json({ messages: [] });
    }
    const context = request.nextUrl.searchParams.get('context') || undefined;
    return NextResponse.json({ messages: await getUiMessages(context) });
  } catch {
    return NextResponse.json({ error: 'Failed to load UI messages' }, { status: 500 });
  }
}
