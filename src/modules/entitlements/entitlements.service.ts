import { queryPg } from '@/config/db';

const CORE_FEATURES = ['webchat', 'agents', 'history', 'billing', 'premium_mode'] as const;

export type EntitlementsMap = Record<(typeof CORE_FEATURES)[number], boolean>;

export async function ensureDefaultEntitlements(userId: number): Promise<void> {
  const flags = await queryPg<{ feature_code: string; default_enabled: boolean }>(
    'SELECT feature_code, default_enabled FROM feature_flags',
  );

  for (const row of flags.rows) {
    await queryPg(
      `INSERT INTO entitlements (user_id, feature_code, enabled, enabled_at, source)
       VALUES ($1, $2, $3, CASE WHEN $3 THEN CURRENT_TIMESTAMP ELSE NULL END, 'default')
       ON DUPLICATE KEY UPDATE user_id = user_id`,
      [userId, row.feature_code, row.default_enabled],
    );
  }
}

export async function enableCorePremiumEntitlements(userId: number, source: string): Promise<void> {
  for (const featureCode of ['webchat', 'agents', 'history', 'premium_mode']) {
    await queryPg(
      `INSERT INTO entitlements (user_id, feature_code, enabled, enabled_at, source)
       VALUES ($1, $2, TRUE, CURRENT_TIMESTAMP, $3)
       ON DUPLICATE KEY UPDATE enabled = TRUE, enabled_at = CURRENT_TIMESTAMP, source = VALUES(source)`,
      [userId, featureCode, source],
    );
  }
}

export async function setEntitlement(userId: number, featureCode: string, enabled: boolean, source: string): Promise<void> {
  await queryPg(
    `INSERT INTO entitlements (user_id, feature_code, enabled, enabled_at, source)
     VALUES ($1, $2, $3, CASE WHEN $3 THEN CURRENT_TIMESTAMP ELSE NULL END, $4)
     ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), enabled_at = CASE WHEN VALUES(enabled) THEN CURRENT_TIMESTAMP ELSE enabled_at END, source = VALUES(source)`,
    [userId, featureCode, enabled, source],
  );
}

export async function getEntitlements(userId: number): Promise<EntitlementsMap> {
  await ensureDefaultEntitlements(userId);
  const rows = await queryPg<{ feature_code: string; enabled: boolean }>(
    'SELECT feature_code, enabled FROM entitlements WHERE user_id = $1',
    [userId],
  );

  const mapped = Object.fromEntries(CORE_FEATURES.map((feature) => [feature, false])) as EntitlementsMap;
  for (const row of rows.rows) {
    if (row.feature_code in mapped) {
      mapped[row.feature_code as keyof EntitlementsMap] = row.enabled;
    }
  }
  return mapped;
}
