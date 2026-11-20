-- Gateway de pagamento (Mercado Pago): novos metodo e colunas de rastreio nas tabelas de pagamento.
SET @db = DATABASE();

ALTER TABLE payment_simulations
  MODIFY method ENUM('pix','boleto','credit_card','debit_card','transfer','gateway') NOT NULL;
ALTER TABLE dojo_payment_simulations
  MODIFY method ENUM('pix','boleto','credit_card','debit_card','transfer','gateway') NOT NULL;

SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='payment_simulations' AND COLUMN_NAME='gateway_provider')=0,
  'ALTER TABLE payment_simulations ADD COLUMN gateway_provider VARCHAR(20) NULL, ADD COLUMN gateway_preference_id VARCHAR(80) NULL, ADD COLUMN gateway_payment_id VARCHAR(40) NULL, ADD COLUMN gateway_checkout_url VARCHAR(500) NULL, ADD COLUMN gateway_status VARCHAR(30) NULL, ADD UNIQUE KEY uq_payment_gateway_payment (gateway_payment_id)', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='dojo_payment_simulations' AND COLUMN_NAME='gateway_provider')=0,
  'ALTER TABLE dojo_payment_simulations ADD COLUMN gateway_provider VARCHAR(20) NULL, ADD COLUMN gateway_preference_id VARCHAR(80) NULL, ADD COLUMN gateway_payment_id VARCHAR(40) NULL, ADD COLUMN gateway_checkout_url VARCHAR(500) NULL, ADD COLUMN gateway_status VARCHAR(30) NULL, ADD UNIQUE KEY uq_dojo_payment_gateway_payment (gateway_payment_id)', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
