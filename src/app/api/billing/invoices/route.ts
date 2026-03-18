import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { ensureBillingTables } from '@/lib/billing';
import { getDb } from '@/lib/db';
import { getPaymentInvoices } from '@/modules/billing/billing.service';
import { creditsToCents, hasPostgresConfig } from '@/config/env';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = requireUser(request);
    if (hasPostgresConfig()) {
      const invoices = await getPaymentInvoices(user.id);
      return NextResponse.json({
        invoices: invoices.map((invoice) => ({
          session_id: invoice.stripe_session_id,
          checkout_type: 'topup',
          amount_cents: Math.round(Number(invoice.gross_amount_eur) * 100),
          credit_amount_cents: creditsToCents(Number(invoice.credits_issued ?? 0)),
          discount_percent: 0,
          created_at: invoice.created_at,
          title: invoice.status === 'completed' || invoice.status === 'paid' ? 'Guthaben-Rechnung' : 'Zahlungsbeleg',
          download_url: `/api/billing/invoices/${encodeURIComponent(invoice.stripe_session_id)}`,
        })),
      });
    }
    ensureBillingTables();

    const invoices = getDb()
      .prepare(
        `SELECT session_id, checkout_type, amount_cents, credit_amount_cents, discount_percent, created_at
         FROM billing_events
         WHERE user_id = ?
         ORDER BY created_at DESC, session_id DESC`,
      )
      .all(user.id) as Array<{
      session_id: string;
      checkout_type: 'activation' | 'topup';
      amount_cents: number;
      credit_amount_cents: number;
      discount_percent: number;
      created_at: string;
    }>;

    return NextResponse.json({
      invoices: invoices.map((invoice) => ({
        ...invoice,
        title: invoice.checkout_type === 'activation' ? 'Aktivierungsrechnung' : 'Guthaben-Rechnung',
        download_url: `/api/billing/invoices/${encodeURIComponent(invoice.session_id)}`,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load invoices';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    return NextResponse.json({ error: 'Failed to load invoices' }, { status: 500 });
  }
}
