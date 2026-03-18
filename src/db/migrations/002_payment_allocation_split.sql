ALTER TABLE payment_allocations
  ADD COLUMN IF NOT EXISTS gross_amount_cents BIGINT NOT NULL DEFAULT 0;

ALTER TABLE payment_allocations
  ADD COLUMN IF NOT EXISTS usage_budget_cents BIGINT NOT NULL DEFAULT 0;

ALTER TABLE payment_allocations
  ADD COLUMN IF NOT EXISTS admin_share_cents BIGINT NOT NULL DEFAULT 0;

-- Backfill for existing rows (best-effort, based on existing EUR columns).
UPDATE payment_allocations
SET
  gross_amount_cents = CASE
    WHEN gross_amount_cents > 0 THEN gross_amount_cents
    ELSE COALESCE(ROUND(gross_amount_eur * 100), 0)::bigint
  END,
  usage_budget_cents = CASE
    WHEN usage_budget_cents > 0 THEN usage_budget_cents
    ELSE COALESCE(ROUND(api_budget_eur * 100), 0)::bigint
  END,
  admin_share_cents = CASE
    WHEN admin_share_cents > 0 THEN admin_share_cents
    ELSE (
      CASE
        WHEN gross_amount_cents > 0 THEN gross_amount_cents
        ELSE COALESCE(ROUND(gross_amount_eur * 100), 0)::bigint
      END
      -
      CASE
        WHEN usage_budget_cents > 0 THEN usage_budget_cents
        ELSE COALESCE(ROUND(api_budget_eur * 100), 0)::bigint
      END
    )
  END;

