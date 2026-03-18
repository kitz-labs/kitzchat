import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { ensureBillingTables } from '@/lib/billing';
import { getDb } from '@/lib/db';
import { creditsToCents, hasPostgresConfig } from '@/config/env';
import { queryPg } from '@/config/db';

export const dynamic = 'force-dynamic';

function escapePdf(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function buildPdf(lines: string[]): Buffer {
  const content = `BT\n/F1 12 Tf\n50 780 Td\n16 TL\n${lines.map((line) => `(${escapePdf(line)}) Tj\nT*`).join('\n')}\nET`;
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj',
    `4 0 obj << /Length ${content.length} >> stream\n${content}\nendstream endobj`,
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += `${object}\n`;
  }
  const xrefStart = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, 'utf8');
}

export async function GET(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const user = requireUser(request);
    const { sessionId } = await context.params;
    if (hasPostgresConfig()) {
      const row = await queryPg<{
        stripe_session_id: string;
        gross_amount_eur: number;
        status: string;
        credits_issued: number;
        created_at: string;
      }>(
        `SELECT stripe_session_id, gross_amount_eur, status, credits_issued, created_at
         FROM payments
         WHERE user_id = $1 AND stripe_session_id = $2
         LIMIT 1`,
        [user.id, sessionId],
      );
      const invoice = row.rows[0];
      if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });

      const creditCents = creditsToCents(Number(invoice.credits_issued ?? 0));
      const amountCents = Math.round(Number(invoice.gross_amount_eur ?? 0) * 100);
      const lines = [
        'KitzChat Rechnung',
        '',
        `Kunde: ${user.username}`,
        `Rechnungsdatum: ${new Date(invoice.created_at).toLocaleString('de-DE')}`,
        `Rechnungsnummer: ${invoice.stripe_session_id}`,
        `Typ: Guthaben-Aufladung`,
        `Status: ${String(invoice.status || '').toUpperCase()}`,
        `Berechneter Betrag: EUR ${(amountCents / 100).toFixed(2)}`,
        `Gutgeschriebenes Guthaben: EUR ${((creditCents || amountCents) / 100).toFixed(2)}`,
        '',
        'Vielen Dank fuer deine Zahlung bei KitzChat.',
        'www.aikitz.at',
      ];

      const pdf = buildPdf(lines);
      return new NextResponse(new Uint8Array(pdf), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="kitzchat-rechnung-${invoice.stripe_session_id}.pdf"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    ensureBillingTables();

    const invoice = getDb()
      .prepare(
        `SELECT session_id, checkout_type, amount_cents, credit_amount_cents, discount_percent, created_at
         FROM billing_events
         WHERE user_id = ? AND session_id = ?`,
      )
      .get(user.id, sessionId) as {
      session_id: string;
      checkout_type: 'activation' | 'topup';
      amount_cents: number;
      credit_amount_cents: number;
      discount_percent: number;
      created_at: string;
    } | undefined;

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    const lines = [
      'KitzChat Rechnung',
      '',
      `Kunde: ${user.username}`,
      `Rechnungsdatum: ${new Date(invoice.created_at).toLocaleString('de-DE')}`,
      `Rechnungsnummer: ${invoice.session_id}`,
      `Typ: ${invoice.checkout_type === 'activation' ? 'Aktivierung' : 'Guthaben-Aufladung'}`,
      `Berechneter Betrag: EUR ${(invoice.amount_cents / 100).toFixed(2)}`,
      `Gutgeschriebenes Guthaben: EUR ${((invoice.credit_amount_cents || invoice.amount_cents) / 100).toFixed(2)}`,
      `Rabatt: ${invoice.discount_percent > 0 ? `${invoice.discount_percent}%` : 'Kein Rabatt'}`,
      '',
      'Vielen Dank fuer deine Zahlung bei KitzChat.',
      'www.aikitz.at',
    ];

    const pdf = buildPdf(lines);
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="kitzchat-rechnung-${invoice.session_id}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create invoice';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    return NextResponse.json({ error: 'Failed to create invoice' }, { status: 500 });
  }
}
