-- Reclame aqui e Ajuda: chamados de qualquer usuario, respondidos pelo FightPass
CREATE TABLE IF NOT EXISTS support_tickets (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  kind ENUM('reclamacao', 'ajuda') NOT NULL,
  category VARCHAR(50) NULL,
  subject VARCHAR(150) NOT NULL,
  message TEXT NOT NULL,
  status ENUM('open', 'in_progress', 'resolved') NOT NULL DEFAULT 'open',
  response TEXT NULL,
  responded_by BIGINT UNSIGNED NULL,
  responded_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_support_user (user_id),
  INDEX idx_support_status (status, kind),
  CONSTRAINT fk_support_user FOREIGN KEY (user_id) REFERENCES users(id)
);
