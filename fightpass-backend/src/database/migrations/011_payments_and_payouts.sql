-- Pagamentos completos (cartao, parcelas, comprovante) e pagamento de instrutores.
-- Pode ser executado mais de uma vez: so adiciona colunas que ainda nao existem.

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payment_simulations' AND COLUMN_NAME = 'penalty_cents');
SET @ddl := IF(@exists = 0, 'ALTER TABLE payment_simulations ADD COLUMN penalty_cents INT NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payment_simulations' AND COLUMN_NAME = 'installments');
SET @ddl := IF(@exists = 0, 'ALTER TABLE payment_simulations ADD COLUMN installments TINYINT NOT NULL DEFAULT 1', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payment_simulations' AND COLUMN_NAME = 'card_brand');
SET @ddl := IF(@exists = 0, 'ALTER TABLE payment_simulations ADD COLUMN card_brand VARCHAR(20) NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payment_simulations' AND COLUMN_NAME = 'card_last4');
SET @ddl := IF(@exists = 0, 'ALTER TABLE payment_simulations ADD COLUMN card_last4 CHAR(4) NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payment_simulations' AND COLUMN_NAME = 'expires_at');
SET @ddl := IF(@exists = 0, 'ALTER TABLE payment_simulations ADD COLUMN expires_at DATETIME NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payment_simulations' AND COLUMN_NAME = 'receipt_code');
SET @ddl := IF(@exists = 0, 'ALTER TABLE payment_simulations ADD COLUMN receipt_code VARCHAR(40) NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'institution_user' AND COLUMN_NAME = 'lesson_rate_cents');
SET @ddl := IF(@exists = 0, 'ALTER TABLE institution_user ADD COLUMN lesson_rate_cents INT NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

ALTER TABLE payment_simulations
  MODIFY method ENUM('pix', 'boleto', 'credit_card', 'debit_card', 'transfer') NOT NULL;

CREATE TABLE IF NOT EXISTS instructor_payouts (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  institution_id BIGINT UNSIGNED NOT NULL,
  instructor_id BIGINT UNSIGNED NOT NULL,
  reference_month CHAR(7) NOT NULL,
  lessons_count INT NOT NULL,
  rate_cents INT NOT NULL,
  amount_cents INT NOT NULL,
  method ENUM('pix', 'transfer') NOT NULL DEFAULT 'pix',
  status ENUM('paid') NOT NULL DEFAULT 'paid',
  receipt_code VARCHAR(40) NOT NULL,
  paid_by BIGINT UNSIGNED NULL,
  paid_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_payout_month (institution_id, instructor_id, reference_month),
  INDEX idx_payout_instructor (instructor_id),
  CONSTRAINT fk_payout_institution FOREIGN KEY (institution_id) REFERENCES institutions(id),
  CONSTRAINT fk_payout_instructor FOREIGN KEY (instructor_id) REFERENCES users(id)
);
