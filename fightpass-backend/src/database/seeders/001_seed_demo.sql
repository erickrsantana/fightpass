INSERT IGNORE INTO roles (id, code, name) VALUES
  (1, 'student', 'Aluno'),
  (2, 'instructor', 'Instrutor'),
  (3, 'institution_admin', 'Administrador da Instituição'),
  (4, 'staff', 'Equipe de Apoio');

INSERT IGNORE INTO modalities (id, name, slug, description) VALUES
  (1, 'Boxe', 'boxe', 'Treinamento de boxe'),
  (2, 'Jiu-Jitsu', 'jiu-jitsu', 'Treinamento de jiu-jitsu'),
  (3, 'Judô', 'judo', 'Treinamento de judô'),
  (4, 'Muay Thai', 'muay-thai', 'Treinamento de muay thai');

INSERT IGNORE INTO users (id, role_id, name, email, password_hash, document, phone, is_active) VALUES
  (1, 3, 'Dojo Sakura', 'contato@dojosakura.com', '$2a$10$nChDIeuhtmvUUyeLcMDS/ONhOUO./TK2hQt3J2cgEArC/6j4qt8VW', '12.345.678/0001-90', '(11) 3000-2000', 1),
  (2, 2, 'Carlos Sensei', 'carlos@dojosakura.com', '$2a$10$nChDIeuhtmvUUyeLcMDS/ONhOUO./TK2hQt3J2cgEArC/6j4qt8VW', '123.456.789-00', '(11) 98888-1111', 1),
  (3, 1, 'João Silva', 'joao@fightpass.com', '$2a$10$nChDIeuhtmvUUyeLcMDS/ONhOUO./TK2hQt3J2cgEArC/6j4qt8VW', '529.982.247-25', '(11) 97777-1111', 1);

UPDATE users
SET password_hash = '$2a$10$nChDIeuhtmvUUyeLcMDS/ONhOUO./TK2hQt3J2cgEArC/6j4qt8VW'
WHERE id IN (1, 2, 3);

UPDATE users SET name = 'João Silva', document = '529.982.247-25' WHERE id = 3;
UPDATE modalities SET name = 'Judô', description = 'Treinamento de judô' WHERE id = 3;

INSERT IGNORE INTO institutions (id, owner_user_id, name, legal_document, email, phone, description, status) VALUES
  (1, 1, 'Dojo Sakura', '12.345.678/0001-90', 'contato@dojosakura.com', '(11) 3000-2000', 'Academia especializada em artes marciais tradicionais e modernas.', 'active');

INSERT INTO platform_plans (id, code, name, description, price_cents, audience, duration_days, is_active) VALUES
  (1, 'dojo_monthly', 'Plano DOJO', 'Mensalidade para academias parceiras publicarem e gerenciarem aulas no FightPass.', 6900, 'dojo', 30, 1)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  price_cents = VALUES(price_cents),
  audience = VALUES(audience),
  duration_days = VALUES(duration_days),
  is_active = VALUES(is_active);

INSERT IGNORE INTO institution_platform_subscriptions (id, institution_id, plan_id, monthly_fee_cents, status, starts_at, next_billing_at, paid_until) VALUES
  (1, 1, 1, 6900, 'inactive', '2026-01-01', NULL, NULL);

UPDATE institution_platform_subscriptions
SET plan_id = 1, monthly_fee_cents = 6900, status = 'inactive', next_billing_at = NULL, paid_until = NULL
WHERE id = 1;

INSERT IGNORE INTO addresses
  (institution_id, street, number, neighborhood, city, state, zip_code, formatted_address, latitude, longitude, geocoding_provider, geocoding_status, geocoded_at)
VALUES
  (1, 'Rua das Artes', '120', 'Centro', 'São Paulo', 'SP', '01000-000', 'Rua das Artes, 120 - Centro - São Paulo - SP - 01000-000', -23.5505200, -46.6333080, 'seed', 'success', NOW());

UPDATE addresses SET city = 'São Paulo' WHERE institution_id = 1;

INSERT IGNORE INTO institution_user (institution_id, user_id, membership_role, status) VALUES
  (1, 1, 'institution_admin', 'active'),
  (1, 2, 'instructor', 'active'),
  (1, 3, 'student', 'active');

INSERT IGNORE INTO institution_modality (institution_id, modality_id) VALUES
  (1, 2),
  (1, 3),
  (1, 4);

INSERT IGNORE INTO classes (id, institution_id, modality_id, title, description, capacity, status) VALUES
  (1, 1, 4, 'Muay Thai Intermediário', 'Turma noturna para praticantes intermediários.', 25, 'active'),
  (2, 1, 3, 'Judô Matinal', 'Turma voltada para fundamentos e condicionamento.', 20, 'active');

UPDATE classes SET title = 'Muay Thai Intermediário', description = 'Turma noturna para praticantes intermediários.' WHERE id = 1;
UPDATE classes SET title = 'Judô Matinal' WHERE id = 2;

INSERT IGNORE INTO class_schedules (id, class_id, day_of_week, start_time, end_time, room_name) VALUES
  (1, 1, 3, '19:00:00', '20:00:00', 'Sala 1'),
  (2, 2, 5, '07:30:00', '08:30:00', 'Tatame 2');

INSERT IGNORE INTO enrollments (institution_id, student_id, modality_id, status, started_at) VALUES
  (1, 3, 4, 'active', '2026-01-10');

INSERT IGNORE INTO access_plans (id, code, name, description, price_cents, session_limit, duration_days, is_active) VALUES
  (1, 'trial_1_day', 'Plano de Teste', 'Acesso experimental de 1 dia, limitado a 1 treino por CPF.', 0, 1, 1, 1),
  (2, 'avulso', 'Plano Avulso', 'Direito a 1 luta/treino.', 1990, 1, 30, 1),
  (3, 'intermediario', 'Plano Intermediário', 'Direito a 3 lutas/treinos.', 4990, 3, 30, 1),
  (4, 'total', 'Plano FightPass Total', 'Acesso livre às lutas/treinos disponíveis.', 8990, NULL, 30, 1);

INSERT IGNORE INTO student_access_passes (id, student_id, plan_id, source, status, starts_at, expires_at, sessions_total, sessions_used) VALUES
  (1, 3, 4, 'payment', 'active', '2026-04-01 00:00:00', '2026-05-31 23:59:59', NULL, 0),
  (2, 3, 1, 'trial', 'expired', '2026-03-01 00:00:00', '2026-03-02 00:00:00', 1, 1);

INSERT IGNORE INTO student_trial_uses (id, document, student_id, access_pass_id, started_at, expires_at) VALUES
  (1, '52998224725', 3, 2, '2026-03-01 00:00:00', '2026-03-02 00:00:00');

INSERT IGNORE INTO bookings (id, student_id, class_schedule_id, booking_date, status, is_trial, expires_at) VALUES
  (1, 3, 1, '2026-04-22', 'confirmed', 0, NULL),
  (2, 3, 2, '2026-05-01', 'scheduled', 0, NULL);

UPDATE bookings SET booking_date = '2026-04-22', status = 'confirmed' WHERE id = 1;
UPDATE bookings SET booking_date = '2026-05-01', status = 'scheduled' WHERE id = 2;

INSERT IGNORE INTO access_pass_usage (access_pass_id, booking_id) VALUES
  (1, 1),
  (1, 2);

INSERT IGNORE INTO payment_simulations (id, student_id, plan_id, access_pass_id, method, amount_cents, status, pix_code, boleto_code, paid_at) VALUES
  (1, 3, 4, 1, 'pix', 8990, 'paid', '00020126360014BR.GOV.BCB.PIX520400005303986540589.905802BR5910FIGHTPASS6009SAO PAULO62140510FP000000016304FICT', NULL, '2026-04-01 09:00:00');

INSERT IGNORE INTO attendances (id, booking_id, student_id, checked_in_at, status) VALUES
  (1, 1, 3, '2026-04-22 19:05:00', 'present');

INSERT IGNORE INTO student_evaluations (institution_id, evaluator_user_id, student_user_id, modality_id, score, comment) VALUES
  (1, 2, 3, 4, 8.60, 'Boa evolução técnica, disciplina constante e melhora no condicionamento.');

INSERT IGNORE INTO student_progress_snapshots (institution_id, student_user_id, reference_month, average_score, attendance_rate, risk_level) VALUES
  (1, 3, '2026-01-01', 7.00, 75.00, 'medium'),
  (1, 3, '2026-02-01', 7.30, 80.00, 'medium'),
  (1, 3, '2026-03-01', 7.90, 88.00, 'low'),
  (1, 3, '2026-04-01', 8.20, 92.00, 'low');

INSERT IGNORE INTO modalities (id, name, slug, description) VALUES
  (5, 'MMA', 'mma', 'Treinamento de artes marciais mistas'),
  (6, 'Karate', 'karate', 'Treinamento de karate'),
  (7, 'Taekwondo', 'taekwondo', 'Treinamento de taekwondo');

INSERT IGNORE INTO institution_modality (institution_id, modality_id) VALUES
  (1, 1),
  (1, 5),
  (1, 6),
  (1, 7);
