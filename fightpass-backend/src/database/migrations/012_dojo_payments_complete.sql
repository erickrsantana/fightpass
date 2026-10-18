-- Pagamento completo da mensalidade DOJO (mesmos recursos do pagamento do aluno).
SET @db = DATABASE();

SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='dojo_payment_simulations' AND COLUMN_NAME='installments')=0,
  'ALTER TABLE dojo_payment_simulations ADD COLUMN installments TINYINT NOT NULL DEFAULT 1', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='dojo_payment_simulations' AND COLUMN_NAME='card_brand')=0,
  'ALTER TABLE dojo_payment_simulations ADD COLUMN card_brand VARCHAR(20) NULL', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='dojo_payment_simulations' AND COLUMN_NAME='card_last4')=0,
  'ALTER TABLE dojo_payment_simulations ADD COLUMN card_last4 CHAR(4) NULL', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='dojo_payment_simulations' AND COLUMN_NAME='expires_at')=0,
  'ALTER TABLE dojo_payment_simulations ADD COLUMN expires_at DATETIME NULL', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='dojo_payment_simulations' AND COLUMN_NAME='receipt_code')=0,
  'ALTER TABLE dojo_payment_simulations ADD COLUMN receipt_code VARCHAR(40) NULL', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

ALTER TABLE dojo_payment_simulations
  MODIFY method ENUM('pix','boleto','credit_card','debit_card','transfer') NOT NULL;
