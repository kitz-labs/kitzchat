SELECT id,user_id,stripe_session_id,stripe_payment_intent_id,stripe_customer_id,gross_amount_eur,status,created_at FROM payments WHERE stripe_session_id='cs_live_b1aS0KnxarAb5Ak8ohG72laqyc7I80lwa59O7kreOZIKRuVnvuKGV4Enps' OR user_id=3 ORDER BY created_at DESC LIMIT 20;
SELECT id, username, payment_status, wallet_balance_cents, stripe_checkout_session_id, stripe_customer_id FROM users WHERE id=3;
