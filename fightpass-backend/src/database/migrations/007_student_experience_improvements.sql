ALTER TABLE users
  ADD COLUMN gender ENUM('female', 'male', 'non_binary', 'prefer_not_to_say', 'other') NULL AFTER phone,
  ADD COLUMN avatar_url VARCHAR(500) NULL AFTER gender;

ALTER TABLE access_plans
  ADD COLUMN features_json JSON NULL AFTER duration_days;

ALTER TABLE payment_simulations
  MODIFY method ENUM('pix', 'boleto', 'credit_card', 'debit_card', 'transfer') NOT NULL;

ALTER TABLE dojo_payment_simulations
  MODIFY method ENUM('pix', 'boleto', 'credit_card', 'debit_card', 'transfer') NOT NULL;

UPDATE access_plans
SET code = 'bronze',
    name = 'Plano Bronze',
    description = 'Plano de entrada para treinar algumas vezes no mes.',
    price_cents = 2990,
    session_limit = 4,
    duration_days = 30,
    features_json = JSON_ARRAY('4 treinos por mes', 'Agendamento pelo aplicativo', 'Check-in por QR Code', 'Acesso ao mapa de academias'),
    is_active = 1
WHERE id = 2;

UPDATE access_plans
SET code = 'prata',
    name = 'Plano Prata',
    description = 'Mais flexibilidade para quem treina toda semana.',
    price_cents = 4990,
    session_limit = 8,
    duration_days = 30,
    features_json = JSON_ARRAY('8 treinos por mes', 'Tudo do Bronze', 'Cancelamento de aulas pelo app', 'Alertas de vencimento do plano'),
    is_active = 1
WHERE id = 3;

UPDATE access_plans
SET code = 'ouro',
    name = 'Plano Ouro',
    description = 'Plano completo para rotina frequente de treinos.',
    price_cents = 6990,
    session_limit = 12,
    duration_days = 30,
    features_json = JSON_ARRAY('12 treinos por mes', 'Tudo do Prata', 'Prioridade em turmas com poucas vagas', 'Historico completo de aulas'),
    is_active = 1
WHERE id = 4;

INSERT INTO access_plans (id, code, name, description, price_cents, session_limit, duration_days, features_json, is_active)
VALUES (
  5,
  'diamante',
  'Plano Diamante',
  'Treinos ilimitados para alunos com rotina intensa.',
  9990,
  NULL,
  30,
  JSON_ARRAY('Treinos ilimitados', 'Tudo do Ouro', 'Melhor custo por treino', 'Acesso amplo as academias parceiras'),
  1
)
ON DUPLICATE KEY UPDATE
  code = VALUES(code),
  name = VALUES(name),
  description = VALUES(description),
  price_cents = VALUES(price_cents),
  session_limit = VALUES(session_limit),
  duration_days = VALUES(duration_days),
  features_json = VALUES(features_json),
  is_active = VALUES(is_active);

UPDATE access_plans
SET is_active = 0
WHERE code IN ('avulso', 'intermediario', 'total');
