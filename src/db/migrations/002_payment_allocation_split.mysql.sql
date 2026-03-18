ALTER TABLE payment_allocations
  ADD COLUMN gross_amount_cents BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN usage_budget_cents BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN admin_share_cents BIGINT NOT NULL DEFAULT 0;

-- Backfill for existing rows (best-effort, based on existing EUR columns).
UPDATE payment_allocations
SET
  gross_amount_cents = IF(gross_amount_cents > 0, gross_amount_cents, ROUND(gross_amount_eur * 100)),
  usage_budget_cents = IF(usage_budget_cents > 0, usage_budget_cents, ROUND(api_budget_eur * 100)),
  admin_share_cents = IF(
    admin_share_cents > 0,
    admin_share_cents,
    IF(gross_amount_cents > 0, gross_amount_cents, ROUND(gross_amount_eur * 100)) - IF(usage_budget_cents > 0, usage_budget_cents, ROUND(api_budget_eur * 100))
  );

