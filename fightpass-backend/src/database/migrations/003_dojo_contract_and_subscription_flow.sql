ALTER TABLE institution_platform_subscriptions
  ADD COLUMN contract_accepted_at DATETIME NULL AFTER cancelled_at,
  ADD COLUMN contract_accepted_by BIGINT UNSIGNED NULL AFTER contract_accepted_at,
  ADD CONSTRAINT fk_platform_subscriptions_contract_user FOREIGN KEY (contract_accepted_by) REFERENCES users(id);

ALTER TABLE dojo_payment_simulations
  ADD COLUMN contract_accepted TINYINT(1) NOT NULL DEFAULT 0 AFTER amount_cents,
  ADD COLUMN contract_accepted_at DATETIME NULL AFTER contract_accepted,
  ADD COLUMN contract_text_version VARCHAR(50) NULL AFTER contract_accepted_at;

UPDATE institution_platform_subscriptions
SET status = 'inactive',
    paid_until = NULL,
    cancelled_at = COALESCE(cancelled_at, NOW())
WHERE status = 'active';
