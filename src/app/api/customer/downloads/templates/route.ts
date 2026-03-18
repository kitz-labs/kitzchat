import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { CSV_TEMPLATE_METAS } from '@/data/downloads/csv-templates';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = requireUser(request);
    if (user.account_type !== 'customer') {
      return NextResponse.json({ error: 'Customer access required' }, { status: 403 });
    }

    return NextResponse.json({ templates: CSV_TEMPLATE_METAS });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load templates';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    return NextResponse.json({ error: 'Failed to load templates' }, { status: 500 });
  }
}

