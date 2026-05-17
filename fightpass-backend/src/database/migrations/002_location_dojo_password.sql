ALTER TABLE addresses
  ADD COLUMN complement VARCHAR(100) NULL AFTER number,
  ADD COLUMN formatted_address VARCHAR(255) NULL AFTER zip_code,
  ADD COLUMN geocoding_provider VARCHAR(50) NULL AFTER formatted_address,
  ADD COLUMN geocoding_status ENUM('pending', 'success', 'failed', 'manual') NOT NULL DEFAULT 'pending' AFTER geocoding_provider,
  ADD COLUMN geocoded_at DATETIME NULL AFTER geocoding_status;

CREATE TABLE IF NOT EXISTS cep_cache (
  zip_code VARCHAR(10) PRIMARY KEY,
  street VARCHAR(150) NULL,
  neighborhood VARCHAR(100) NULL,
  city VARCHAR(100) NOT NULL,
  state VARCHAR(2) NOT NULL,
  formatted_address VARCHAR(255) NULL,
  latitude DECIMAL(10, 7) NULL,
  longitude DECIMAL(10, 7) NULL,
  geocoding_provider VARCHAR(50) NULL,
  geocoding_status ENUM('pending', 'success', 'failed') NOT NULL DEFAULT 'pending',
  geocoded_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS platform_plans (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(255) NOT NULL,
  price_cents INT NOT NULL,
  audience ENUM('student', 'dojo') NOT NULL,
  duration_days INT NOT NULL DEFAULT 30,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO platform_plans (code, name, description, price_cents, audience, duration_days, is_active)
VALUES ('dojo_monthly', 'Plano DOJO', 'Mensalidade para academias parceiras publicarem e gerenciarem aulas no FightPass.', 6900, 'dojo', 30, 1)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  price_cents = VALUES(price_cents),
  audience = VALUES(audience),
  duration_days = VALUES(duration_days),
  is_active = VALUES(is_active);

ALTER TABLE institution_platform_subscriptions
  ADD COLUMN plan_id BIGINT UNSIGNED NULL AFTER institution_id,
  ADD COLUMN paid_until DATE NULL AFTER next_billing_at,
  ADD COLUMN cancelled_at DATETIME NULL AFTER paid_until,
  ADD CONSTRAINT fk_platform_subscriptions_plan FOREIGN KEY (plan_id) REFERENCES platform_plans(id);

UPDATE institution_platform_subscriptions s
JOIN platform_plans p ON p.code = 'dojo_monthly'
SET s.plan_id = p.id,
    s.monthly_fee_cents = 6900,
    s.paid_until = COALESCE(s.paid_until, s.next_billing_at),
    s.next_billing_at = COALESCE(s.next_billing_at, DATE_ADD(CURDATE(), INTERVAL 30 DAY));

CREATE TABLE IF NOT EXISTS dojo_payment_simulations (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  institution_id BIGINT UNSIGNED NOT NULL,
  plan_id BIGINT UNSIGNED NOT NULL,
  method ENUM('pix', 'boleto') NOT NULL,
  amount_cents INT NOT NULL,
  status ENUM('pending', 'paid', 'cancelled') NOT NULL DEFAULT 'pending',
  pix_code VARCHAR(255) NULL,
  boleto_code VARCHAR(120) NULL,
  paid_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_dojo_payments_institution FOREIGN KEY (institution_id) REFERENCES institutions(id),
  CONSTRAINT fk_dojo_payments_plan FOREIGN KEY (plan_id) REFERENCES platform_plans(id)
);

DROP TABLE IF EXISTS password_reset_tokens;

CREATE TABLE password_reset_tokens (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  email VARCHAR(150) NOT NULL,
  token_hash VARCHAR(100) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  request_ip VARCHAR(45) NULL,
  user_agent VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_password_reset_tokens_user FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_password_reset_email (email),
  INDEX idx_password_reset_expires (expires_at)
);
