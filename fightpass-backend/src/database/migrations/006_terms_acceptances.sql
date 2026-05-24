CREATE TABLE IF NOT EXISTS terms_acceptances (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  terms_version VARCHAR(50) NOT NULL,
  origin ENUM('cadastro', 'contratacao_plano') NOT NULL,
  accepted_at DATETIME NOT NULL,
  ip_address VARCHAR(45) NULL,
  user_agent VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_terms_acceptance_user_version_origin (user_id, terms_version, origin),
  CONSTRAINT fk_terms_acceptances_user FOREIGN KEY (user_id) REFERENCES users(id)
);

ALTER TABLE payment_simulations
  ADD COLUMN terms_acceptance_id BIGINT UNSIGNED NULL AFTER amount_cents,
  ADD CONSTRAINT fk_payment_simulations_terms_acceptance FOREIGN KEY (terms_acceptance_id) REFERENCES terms_acceptances(id);

ALTER TABLE dojo_payment_simulations
  ADD COLUMN terms_acceptance_id BIGINT UNSIGNED NULL AFTER amount_cents,
  ADD CONSTRAINT fk_dojo_payments_terms_acceptance FOREIGN KEY (terms_acceptance_id) REFERENCES terms_acceptances(id);
