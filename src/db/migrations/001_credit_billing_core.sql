CREATE TABLE IF NOT EXISTS users (
  id BIGINT PRIMARY KEY,
  email TEXT,
  name TEXT NOT NULL,
  stripe_customer_id TEXT,
  chat_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wallets (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  balance_credits BIGINT NOT NULL DEFAULT 0,
  currency_display TEXT NOT NULL DEFAULT 'credits',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wallet_ledger (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_id BIGINT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  entry_type TEXT NOT NULL,
  credits_delta BIGINT NOT NULL,
  balance_after BIGINT NOT NULL,
  reference_type TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_user_created ON wallet_ledger(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS payments (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_session_id TEXT UNIQUE,
  stripe_payment_intent_id TEXT,
  stripe_customer_id TEXT,
  gross_amount_eur NUMERIC(12, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'eur',
  status TEXT NOT NULL,
  credits_issued BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payment_allocations (
  id BIGSERIAL PRIMARY KEY,
  payment_id BIGINT NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  gross_amount_eur NUMERIC(12, 2) NOT NULL,
  api_budget_eur NUMERIC(12, 2) NOT NULL,
  reserve_eur NUMERIC(12, 2) NOT NULL,
  allocation_rule TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS entitlements (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  feature_code TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  enabled_at TIMESTAMPTZ,
  source TEXT NOT NULL,
  UNIQUE(user_id, feature_code)
);

CREATE TABLE IF NOT EXISTS usage_runs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_code TEXT NOT NULL,
  request_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  credits_charged BIGINT NOT NULL DEFAULT 0,
  openai_cost_eur NUMERIC(12, 6) NOT NULL DEFAULT 0,
  model_internal TEXT NOT NULL,
  model_display_mode TEXT NOT NULL,
  routing_reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_usage_runs_user_created ON usage_runs(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS webhook_events (
  id BIGSERIAL PRIMARY KEY,
  stripe_event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  processed BOOLEAN NOT NULL DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS model_routing_rules (
  id BIGSERIAL PRIMARY KEY,
  rule_code TEXT NOT NULL UNIQUE,
  task_type TEXT NOT NULL,
  min_balance_ratio NUMERIC(5, 2) NOT NULL,
  max_balance_ratio NUMERIC(5, 2) NOT NULL,
  prompt_size_class TEXT NOT NULL,
  preferred_model TEXT NOT NULL,
  fallback_model TEXT NOT NULL,
  display_mode TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  priority INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS topup_offers (
  id BIGSERIAL PRIMARY KEY,
  offer_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  amount_eur NUMERIC(12, 2) NOT NULL,
  credits BIGINT NOT NULL,
  bonus_credits BIGINT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 1,
  marketing_label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ui_messages (
  id BIGSERIAL PRIMARY KEY,
  message_code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  context_area TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS feature_flags (
  id BIGSERIAL PRIMARY KEY,
  feature_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  default_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_price_rules (
  id BIGSERIAL PRIMARY KEY,
  agent_code TEXT NOT NULL UNIQUE,
  pricing_mode TEXT NOT NULL,
  base_credits NUMERIC(12, 4) NOT NULL DEFAULT 0,
  input_token_factor NUMERIC(12, 6) NOT NULL DEFAULT 0,
  output_token_factor NUMERIC(12, 6) NOT NULL DEFAULT 0,
  min_charge BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS webhook_event_types (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  purpose TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
