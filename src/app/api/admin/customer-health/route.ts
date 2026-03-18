import { NextResponse } from 'next/server';
import { creditsToCents, hasPostgresConfig } from '@/config/env';
import { queryPg } from '@/config/db';
import { requireAdmin, listUsers } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { getSecretEncryptionSource, isEncryptedSecret, isSecretEncryptionAvailable } from '@/lib/secret-store';

export const dynamic = 'force-dynamic';

type LoginRow = {
  id: number;
  last_login_at: string | null;
};

type UsageRow = {
  user_id: number;
  last_active_at: number | null;
};

type SupportRow = {
  user_id: number;
  unread_customer_messages: number;
  last_support_at: string | null;
};

type PreferenceRow = {
  user_id: number;
  docu_app_password: string | null;
  docu_api_key: string | null;
  docu_access_token: string | null;
  mail_password: string | null;
  instagram_password: string | null;
  instagram_user_access_token: string | null;
  cloud_password: string | null;
  integration_profiles: string | null;
};

type BillingWalletRow = {
  user_id: number;
  balance_credits: number | string;
  status: string | null;
};

type BillingPaymentRow = {
  user_id: number;
  successful_payments: number | string;
  total_paid_eur: number | string;
  last_payment_at: string | null;
};

type SecurityWarning = {
  level: 'info' | 'warning' | 'critical';
  code: string;
  title: string;
  detail: string;
};

function normalizeText(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isLegacyStoredSecret(value: string | null | undefined, options?: { allowJsonEmpty?: boolean }): boolean {
  const normalized = normalizeText(value);
  if (!normalized) return false;
  if (options?.allowJsonEmpty && (normalized === '[]' || normalized === '{}')) return false;
  return !isEncryptedSecret(normalized);
}

function unixToIso(value: number | null | undefined): string | null {
  if (!Number.isFinite(value) || !value) return null;
  return new Date(Number(value) * 1000).toISOString();
}

function hoursSince(value: string | null | undefined): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return (Date.now() - timestamp) / (1000 * 60 * 60);
}

export async function GET(request: Request) {
  try {
    requireAdmin(request);

    const db = getDb();
    const customers = listUsers().filter((user) => user.account_type === 'customer');
    const customerIds = customers.map((customer) => customer.id);

    const loginRows = db
      .prepare("SELECT id, last_login_at FROM users WHERE account_type = 'customer'")
      .all() as LoginRow[];
    const loginMap = new Map(loginRows.map((row) => [row.id, row.last_login_at]));

    const usageRows = db
      .prepare(
        `SELECT user_id, MAX(created_at) AS last_active_at
         FROM chat_usage_events
         GROUP BY user_id`,
      )
      .all() as UsageRow[];
    const usageMap = new Map(usageRows.map((row) => [row.user_id, unixToIso(row.last_active_at)]));

    const supportRows = db
      .prepare(
        `SELECT user_id,
                COALESCE(SUM(CASE WHEN sender = 'customer' AND read_at IS NULL THEN 1 ELSE 0 END), 0) AS unread_customer_messages,
                MAX(created_at) AS last_support_at
         FROM support_messages
         GROUP BY user_id`,
      )
      .all() as SupportRow[];
    const supportMap = new Map(supportRows.map((row) => [row.user_id, row]));

    const preferenceRows = db
      .prepare(
        `SELECT user_id, docu_app_password, docu_api_key, docu_access_token,
                mail_password, instagram_password, instagram_user_access_token, cloud_password, integration_profiles
         FROM customer_preferences`,
      )
      .all() as PreferenceRow[];
    const legacySecretUsers = new Set(
      preferenceRows
        .filter((row) =>
          isLegacyStoredSecret(row.docu_app_password) ||
          isLegacyStoredSecret(row.docu_api_key) ||
          isLegacyStoredSecret(row.docu_access_token) ||
          isLegacyStoredSecret(row.mail_password) ||
          isLegacyStoredSecret(row.instagram_password) ||
          isLegacyStoredSecret(row.instagram_user_access_token) ||
          isLegacyStoredSecret(row.cloud_password) ||
          isLegacyStoredSecret(row.integration_profiles, { allowJsonEmpty: true }),
        )
        .map((row) => row.user_id),
    );

    const billingConfigured = hasPostgresConfig();
    const walletMap = new Map<number, { balance_cents: number; status: string | null }>();
    const paymentMap = new Map<number, { successful_payments: number; total_paid_eur: number; last_payment_at: string | null }>();

    if (billingConfigured && customerIds.length > 0) {
      const placeholders = customerIds.map((_, index) => `$${index + 1}`).join(', ');

      try {
        const walletRows = await queryPg<BillingWalletRow>(
          `SELECT user_id, balance_credits, status
           FROM wallets
           WHERE user_id IN (${placeholders})`,
          customerIds,
        );
        for (const row of walletRows.rows) {
          walletMap.set(Number(row.user_id), {
            balance_cents: creditsToCents(Number(row.balance_credits ?? 0)),
            status: row.status ?? null,
          });
        }
      } catch {
        // ignore billing wallet telemetry when the billing schema is unreachable
      }

      try {
        const paymentRows = await queryPg<BillingPaymentRow>(
          `SELECT user_id,
                  COALESCE(SUM(CASE WHEN status IN ('completed', 'paid') THEN 1 ELSE 0 END), 0) AS successful_payments,
                  COALESCE(SUM(CASE WHEN status IN ('completed', 'paid') THEN gross_amount_eur ELSE 0 END), 0) AS total_paid_eur,
                  MAX(created_at) AS last_payment_at
           FROM payments
           WHERE user_id IN (${placeholders})
           GROUP BY user_id`,
          customerIds,
        );
        for (const row of paymentRows.rows) {
          paymentMap.set(Number(row.user_id), {
            successful_payments: Number(row.successful_payments ?? 0),
            total_paid_eur: Number(row.total_paid_eur ?? 0),
            last_payment_at: row.last_payment_at ?? null,
          });
        }
      } catch {
        // ignore billing payment telemetry when the billing schema is unreachable
      }
    }

    const customerRows = customers
      .map((customer) => {
        const loginAt = loginMap.get(customer.id) ?? null;
        const activeAt = usageMap.get(customer.id) ?? null;
        const support = supportMap.get(customer.id);
        const billingWallet = walletMap.get(customer.id);
        const billingPayments = paymentMap.get(customer.id);
        const localWalletCents = Math.max(0, Math.round(customer.wallet_balance_cents ?? 0));
        const billingWalletCents = billingWallet?.balance_cents ?? null;
        const effectiveWalletCents = billingWalletCents ?? localWalletCents;
        const activated = customer.payment_status === 'paid' || effectiveWalletCents > 0;
        const termsAccepted = Boolean(customer.accepted_terms_at);
        const emailVerified = Boolean(customer.email_verified_at);
        const onboardingCompleted = Boolean(customer.onboarding_completed_at);
        const unreadSupportCount = Number(support?.unread_customer_messages ?? 0);

        let billingTruth: 'not-configured' | 'live' | 'local-only' | 'missing-wallet' | 'mismatch' = 'not-configured';
        if (billingConfigured) {
          if (billingWalletCents == null) {
            billingTruth = customer.payment_status === 'paid' || localWalletCents > 0 ? 'missing-wallet' : 'local-only';
          } else if (Math.abs(localWalletCents - billingWalletCents) > 1) {
            billingTruth = 'mismatch';
          } else {
            billingTruth = 'live';
          }
        }

        const riskReasons: string[] = [];
        let risk: 'ok' | 'attention' | 'critical' = 'ok';

        if (billingTruth === 'mismatch' || billingTruth === 'missing-wallet') {
          risk = 'critical';
          riskReasons.push('Billing ist nicht sauber synchronisiert');
        }
        if (customer.payment_status === 'paid' && effectiveWalletCents <= 0) {
          risk = 'critical';
          riskReasons.push('Bezahlt, aber ohne verfuegbares Guthaben');
        }
        if (customer.payment_status === 'paid' && !termsAccepted) {
          risk = 'critical';
          riskReasons.push('Aktiver Kunde ohne akzeptierte Hinweise');
        }

        if (risk !== 'critical') {
          if (!emailVerified && customer.email) {
            risk = 'attention';
            riskReasons.push('E-Mail ist noch nicht verifiziert');
          }
          if (!onboardingCompleted) {
            risk = 'attention';
            riskReasons.push('Onboarding ist noch offen');
          }
          if (activated && effectiveWalletCents > 0 && effectiveWalletCents < 500) {
            risk = 'attention';
            riskReasons.push('Wallet ist niedrig');
          }
          if (unreadSupportCount > 0) {
            risk = 'attention';
            riskReasons.push('Offene Support-Nachrichten');
          }
          if (legacySecretUsers.has(customer.id)) {
            risk = 'attention';
            riskReasons.push('Alte Integrationsdaten wurden noch nicht neu gespeichert');
          }
        }

        return {
          id: customer.id,
          username: customer.username,
          email: customer.email ?? null,
          created_at: customer.created_at,
          payment_status: customer.payment_status ?? 'pending',
          activated,
          email_verified: emailVerified,
          terms_accepted: termsAccepted,
          onboarding_completed: onboardingCompleted,
          stripe_customer_connected: Boolean(customer.stripe_customer_id),
          last_login_at: loginAt,
          last_active_at: activeAt,
          last_support_at: support?.last_support_at ?? null,
          unread_support_count: unreadSupportCount,
          local_wallet_balance_cents: localWalletCents,
          billing_wallet_balance_cents: billingWalletCents,
          effective_wallet_balance_cents: effectiveWalletCents,
          billing_wallet_status: billingWallet?.status ?? null,
          billing_truth: billingTruth,
          billing_successful_payments: billingPayments?.successful_payments ?? 0,
          billing_total_paid_eur: billingPayments?.total_paid_eur ?? 0,
          last_payment_at: billingPayments?.last_payment_at ?? null,
          legacy_secret_storage: legacySecretUsers.has(customer.id),
          risk,
          risk_reasons: riskReasons,
          stale_login: (() => {
            const hours = hoursSince(loginAt);
            return hours != null && hours >= 24 * 30;
          })(),
        };
      })
      .sort((left, right) => {
        const riskOrder = { critical: 0, attention: 1, ok: 2 };
        const byRisk = riskOrder[left.risk] - riskOrder[right.risk];
        if (byRisk !== 0) return byRisk;
        return right.effective_wallet_balance_cents - left.effective_wallet_balance_cents;
      });

    const summary = {
      total: customerRows.length,
      activated: customerRows.filter((customer) => customer.activated).length,
      ok: customerRows.filter((customer) => customer.risk === 'ok').length,
      attention: customerRows.filter((customer) => customer.risk === 'attention').length,
      critical: customerRows.filter((customer) => customer.risk === 'critical').length,
      missing_terms: customerRows.filter((customer) => !customer.terms_accepted).length,
      missing_email_verification: customerRows.filter((customer) => customer.email && !customer.email_verified).length,
      billing_mismatches: customerRows.filter((customer) => customer.billing_truth === 'mismatch' || customer.billing_truth === 'missing-wallet').length,
      open_support_threads: customerRows.filter((customer) => customer.unread_support_count > 0).length,
    };

    const securityWarnings: SecurityWarning[] = [];
    const encryptionSource = getSecretEncryptionSource();
    if (!isSecretEncryptionAvailable()) {
      securityWarnings.push({
        level: 'critical',
        code: 'missing_secret_encryption',
        title: 'Kundengeheimnisse sind nicht dediziert abgesichert',
        detail: 'KITZCHAT_SETTINGS_ENCRYPTION_KEY fehlt. Neue Integrationsdaten koennen nicht mit einem separaten Key geschuetzt werden.',
      });
    } else if (encryptionSource === 'api_key') {
      securityWarnings.push({
        level: 'warning',
        code: 'shared_secret_encryption',
        title: 'Kundengeheimnisse nutzen noch API_KEY als Fallback',
        detail: 'Empfohlen ist ein eigener KITZCHAT_SETTINGS_ENCRYPTION_KEY fuer Integrationsdaten.',
      });
    }
    if (summary.missing_terms > 0) {
      securityWarnings.push({
        level: summary.activated > 0 ? 'critical' : 'warning',
        code: 'missing_terms',
        title: `${summary.missing_terms} Kunden ohne akzeptierte Hinweise`,
        detail: 'Diese Konten sollten vor weiterer Aktivierung oder Betreuung bereinigt werden.',
      });
    }
    if (summary.missing_email_verification > 0) {
      securityWarnings.push({
        level: 'warning',
        code: 'missing_email_verification',
        title: `${summary.missing_email_verification} Kunden ohne E-Mail-Verifizierung`,
        detail: 'Verifizierte Adressen reduzieren Support-Aufwand und verbessern Recovery-Workflows.',
      });
    }
    if (legacySecretUsers.size > 0) {
      securityWarnings.push({
        level: 'warning',
        code: 'legacy_secret_storage',
        title: `${legacySecretUsers.size} Kunden mit Alt-Daten in den Integrationen`,
        detail: 'Diese Werte werden bei neuem Speichern oder erneutem Laden in das geschuetzte Format ueberfuehrt.',
      });
    }
    if (summary.billing_mismatches > 0) {
      securityWarnings.push({
        level: 'critical',
        code: 'billing_mismatch',
        title: `${summary.billing_mismatches} Billing-Wahrheiten weichen ab`,
        detail: 'SQLite-Zahlungsstatus und Billing-Wallet stimmen fuer diese Konten nicht sauber ueberein.',
      });
    }

    return NextResponse.json({
      summary,
      security: {
        billing_configured: billingConfigured,
        customer_secret_encryption_available: isSecretEncryptionAvailable(),
        customer_secret_encryption_source: encryptionSource,
        legacy_secret_customer_count: legacySecretUsers.size,
        warnings: securityWarnings,
      },
      customers: customerRows,
      checked_at: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load customer health';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (message === 'forbidden') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    return NextResponse.json({ error: 'Failed to load customer health' }, { status: 500 });
  }
}
