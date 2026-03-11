CREATE TABLE IF NOT EXISTS users (
  id BIGINT PRIMARY KEY,
  email VARCHAR(255) NULL,
  name VARCHAR(255) NOT NULL,
  stripe_customer_id VARCHAR(191) NULL,
  chat_enabled TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wallets (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE,
  balance_credits BIGINT NOT NULL DEFAULT 0,
  currency_display VARCHAR(64) NOT NULL DEFAULT 'credits',
  status VARCHAR(64) NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_wallets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wallet_ledger (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  wallet_id BIGINT NOT NULL,
  entry_type VARCHAR(64) NOT NULL,
  credits_delta BIGINT NOT NULL,
  balance_after BIGINT NOT NULL,
  reference_type VARCHAR(128) NOT NULL,
  reference_id VARCHAR(191) NOT NULL,
  note TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_wallet_ledger_user_created (user_id, created_at DESC),
  CONSTRAINT fk_wallet_ledger_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_wallet_ledger_wallet FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payments (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  stripe_session_id VARCHAR(191) NULL,
  stripe_payment_intent_id VARCHAR(191) NULL,
  stripe_customer_id VARCHAR(191) NULL,
  gross_amount_eur DECIMAL(12, 2) NOT NULL,
  currency VARCHAR(16) NOT NULL DEFAULT 'eur',
  status VARCHAR(32) NOT NULL,
  credits_issued BIGINT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_payments_session (stripe_session_id),
  CONSTRAINT fk_payments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payment_allocations (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  payment_id BIGINT NOT NULL,
  gross_amount_eur DECIMAL(12, 2) NOT NULL,
  api_budget_eur DECIMAL(12, 2) NOT NULL,
  reserve_eur DECIMAL(12, 2) NOT NULL,
  allocation_rule VARCHAR(64) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_payment_allocations_payment FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS entitlements (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  feature_code VARCHAR(128) NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  enabled_at DATETIME NULL,
  source VARCHAR(128) NOT NULL,
  UNIQUE KEY uq_entitlements_user_feature (user_id, feature_code),
  CONSTRAINT fk_entitlements_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS usage_runs (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  agent_code VARCHAR(128) NOT NULL,
  request_id VARCHAR(191) NOT NULL,
  status VARCHAR(32) NOT NULL,
  input_tokens INT NOT NULL DEFAULT 0,
  output_tokens INT NOT NULL DEFAULT 0,
  credits_charged BIGINT NOT NULL DEFAULT 0,
  openai_cost_eur DECIMAL(12, 6) NOT NULL DEFAULT 0,
  model_internal VARCHAR(128) NOT NULL,
  model_display_mode VARCHAR(128) NOT NULL,
  routing_reason VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_usage_runs_request (request_id),
  KEY idx_usage_runs_user_created (user_id, created_at DESC),
  CONSTRAINT fk_usage_runs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS webhook_events (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  stripe_event_id VARCHAR(191) NOT NULL,
  event_type VARCHAR(191) NOT NULL,
  processed TINYINT(1) NOT NULL DEFAULT 0,
  processed_at DATETIME NULL,
  payload_json JSON NOT NULL,
  UNIQUE KEY uq_webhook_events_stripe_event (stripe_event_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS model_routing_rules (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  rule_code VARCHAR(191) NOT NULL,
  task_type VARCHAR(64) NOT NULL,
  min_balance_ratio DECIMAL(5, 2) NOT NULL,
  max_balance_ratio DECIMAL(5, 2) NOT NULL,
  prompt_size_class VARCHAR(32) NOT NULL,
  preferred_model VARCHAR(128) NOT NULL,
  fallback_model VARCHAR(128) NOT NULL,
  display_mode VARCHAR(128) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  priority INT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_model_routing_rules_code (rule_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS topup_offers (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  offer_code VARCHAR(191) NOT NULL,
  name VARCHAR(191) NOT NULL,
  amount_eur DECIMAL(12, 2) NOT NULL,
  credits BIGINT NOT NULL,
  bonus_credits BIGINT NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 1,
  marketing_label VARCHAR(191) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_topup_offers_code (offer_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ui_messages (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  message_code VARCHAR(191) NOT NULL,
  title VARCHAR(191) NOT NULL,
  body TEXT NOT NULL,
  context_area VARCHAR(128) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ui_messages_code (message_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS feature_flags (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  feature_code VARCHAR(191) NOT NULL,
  name VARCHAR(191) NOT NULL,
  default_enabled TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_feature_flags_code (feature_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS agent_price_rules (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agent_code VARCHAR(191) NOT NULL,
  pricing_mode VARCHAR(64) NOT NULL,
  base_credits DECIMAL(12, 4) NOT NULL DEFAULT 0,
  input_token_factor DECIMAL(12, 6) NOT NULL DEFAULT 0,
  output_token_factor DECIMAL(12, 6) NOT NULL DEFAULT 0,
  min_charge BIGINT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_agent_price_rules_code (agent_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS webhook_event_types (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  event_type VARCHAR(191) NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  purpose VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_webhook_event_types_event (event_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
