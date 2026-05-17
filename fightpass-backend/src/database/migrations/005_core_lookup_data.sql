INSERT INTO roles (code, name) VALUES
  ('student', 'Aluno'),
  ('instructor', 'Instrutor'),
  ('institution_admin', 'Administrador da Instituicao'),
  ('staff', 'Equipe de Apoio')
ON DUPLICATE KEY UPDATE
  name = VALUES(name);

INSERT INTO access_plans (code, name, description, price_cents, session_limit, duration_days, is_active) VALUES
  ('trial_1_day', 'Plano de Teste', 'Acesso experimental de 1 dia, limitado a 1 treino por CPF.', 0, 1, 1, 1),
  ('avulso', 'Plano Avulso', 'Direito a 1 luta/treino.', 1990, 1, 30, 1),
  ('intermediario', 'Plano Intermediario', 'Direito a 3 lutas/treinos.', 4990, 3, 30, 1),
  ('total', 'Plano FightPass Total', 'Acesso livre aos treinos disponiveis.', 8990, NULL, 30, 1)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  price_cents = VALUES(price_cents),
  session_limit = VALUES(session_limit),
  duration_days = VALUES(duration_days),
  is_active = VALUES(is_active);
