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

UPDATE users
SET gender = 'male',
    avatar_url = 'https://images.unsplash.com/photo-1598971639058-a458bc8cb42a?auto=format&fit=crop&w=240&q=80'
WHERE id = 3;

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
VALUES (5, 'diamante', 'Plano Diamante', 'Treinos ilimitados para alunos com rotina intensa.', 9990, NULL, 30, JSON_ARRAY('Treinos ilimitados', 'Tudo do Ouro', 'Melhor custo por treino', 'Acesso amplo as academias parceiras'), 1)
ON DUPLICATE KEY UPDATE
  code = VALUES(code),
  name = VALUES(name),
  description = VALUES(description),
  price_cents = VALUES(price_cents),
  session_limit = VALUES(session_limit),
  duration_days = VALUES(duration_days),
  features_json = VALUES(features_json),
  is_active = VALUES(is_active);

INSERT INTO users (id, role_id, name, email, password_hash, document, phone, gender, is_active) VALUES
  (4, 3, 'Arena Striker Admin', 'admin@arenastriker.com', '$2a$10$nChDIeuhtmvUUyeLcMDS/ONhOUO./TK2hQt3J2cgEArC/6j4qt8VW', '22.345.678/0001-10', '(11) 3100-2001', 'prefer_not_to_say', 1),
  (5, 3, 'Tatame Norte Admin', 'admin@tatamenorte.com', '$2a$10$nChDIeuhtmvUUyeLcMDS/ONhOUO./TK2hQt3J2cgEArC/6j4qt8VW', '33.345.678/0001-10', '(11) 3100-2002', 'prefer_not_to_say', 1),
  (6, 3, 'Centro Olimpico Leste Admin', 'admin@olimpicoleste.com', '$2a$10$nChDIeuhtmvUUyeLcMDS/ONhOUO./TK2hQt3J2cgEArC/6j4qt8VW', '44.345.678/0001-10', '(11) 3100-2003', 'prefer_not_to_say', 1),
  (7, 3, 'Boxe Vila Admin', 'admin@boxevila.com', '$2a$10$nChDIeuhtmvUUyeLcMDS/ONhOUO./TK2hQt3J2cgEArC/6j4qt8VW', '55.345.678/0001-10', '(11) 3100-2004', 'prefer_not_to_say', 1),
  (8, 3, 'Gracie Fight Admin', 'admin@graciefight.com', '$2a$10$nChDIeuhtmvUUyeLcMDS/ONhOUO./TK2hQt3J2cgEArC/6j4qt8VW', '66.345.678/0001-10', '(11) 3100-2005', 'prefer_not_to_say', 1),
  (9, 3, 'Kicks Taekwondo Admin', 'admin@kickstk.com', '$2a$10$nChDIeuhtmvUUyeLcMDS/ONhOUO./TK2hQt3J2cgEArC/6j4qt8VW', '77.345.678/0001-10', '(11) 3100-2006', 'prefer_not_to_say', 1),
  (10, 1, 'Maria Oliveira', 'maria@fightpass.com', '$2a$10$nChDIeuhtmvUUyeLcMDS/ONhOUO./TK2hQt3J2cgEArC/6j4qt8VW', '111.444.777-35', '(11) 97777-2222', 'female', 1),
  (11, 1, 'Igor Gomes da Silva', 'igor@fightpass.com', '$2a$10$nChDIeuhtmvUUyeLcMDS/ONhOUO./TK2hQt3J2cgEArC/6j4qt8VW', '390.533.447-05', '(11) 97777-3333', 'male', 1)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  phone = VALUES(phone),
  gender = VALUES(gender),
  is_active = VALUES(is_active);

INSERT INTO institutions (id, owner_user_id, name, legal_document, email, phone, description, status) VALUES
  (2, 4, 'Arena Striker', '22.345.678/0001-10', 'contato@arenastriker.com', '(11) 3100-2001', 'Academia focada em boxe, muay thai e MMA com aulas todos os dias uteis.', 'active'),
  (3, 5, 'Tatame Norte', '33.345.678/0001-10', 'contato@tatamenorte.com', '(11) 3100-2002', 'Centro de jiu-jitsu, judo e karate com turmas iniciantes e avancadas.', 'active'),
  (4, 6, 'Centro Olimpico Leste', '44.345.678/0001-10', 'contato@olimpicoleste.com', '(11) 3100-2003', 'Espaco de artes marciais olimpicas com judo, karate e taekwondo.', 'active'),
  (5, 7, 'Boxe Vila', '55.345.678/0001-10', 'contato@boxevila.com', '(11) 3100-2004', 'Academia de boxe e MMA para condicionamento e tecnica.', 'active'),
  (6, 8, 'Gracie Fight Club', '66.345.678/0001-10', 'contato@graciefight.com', '(11) 3100-2005', 'Treinos de jiu-jitsu, MMA e muay thai com turmas compactas.', 'active'),
  (7, 9, 'Kicks Taekwondo Center', '77.345.678/0001-10', 'contato@kickstk.com', '(11) 3100-2006', 'Taekwondo, karate e muay thai para evolucao tecnica e disciplina.', 'active')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  email = VALUES(email),
  phone = VALUES(phone),
  description = VALUES(description),
  status = VALUES(status);

INSERT INTO addresses
  (institution_id, street, number, neighborhood, city, state, zip_code, formatted_address, latitude, longitude, geocoding_provider, geocoding_status, geocoded_at)
VALUES
  (2, 'Avenida Paulista', '900', 'Bela Vista', 'Sao Paulo', 'SP', '01310-100', 'Avenida Paulista, 900 - Bela Vista - Sao Paulo - SP - 01310-100', -23.5651000, -46.6529000, 'seed', 'success', NOW()),
  (3, 'Rua Voluntarios da Patria', '1880', 'Santana', 'Sao Paulo', 'SP', '02010-300', 'Rua Voluntarios da Patria, 1880 - Santana - Sao Paulo - SP - 02010-300', -23.5022000, -46.6256000, 'seed', 'success', NOW()),
  (4, 'Avenida Mateo Bei', '2100', 'Sao Mateus', 'Sao Paulo', 'SP', '03949-000', 'Avenida Mateo Bei, 2100 - Sao Mateus - Sao Paulo - SP - 03949-000', -23.6127000, -46.4773000, 'seed', 'success', NOW()),
  (5, 'Rua Harmonia', '455', 'Vila Madalena', 'Sao Paulo', 'SP', '05435-000', 'Rua Harmonia, 455 - Vila Madalena - Sao Paulo - SP - 05435-000', -23.5534000, -46.6909000, 'seed', 'success', NOW()),
  (6, 'Rua Vergueiro', '2400', 'Vila Mariana', 'Sao Paulo', 'SP', '04102-000', 'Rua Vergueiro, 2400 - Vila Mariana - Sao Paulo - SP - 04102-000', -23.5894000, -46.6347000, 'seed', 'success', NOW()),
  (7, 'Avenida Jabaquara', '1600', 'Saude', 'Sao Paulo', 'SP', '04046-200', 'Avenida Jabaquara, 1600 - Saude - Sao Paulo - SP - 04046-200', -23.6165000, -46.6375000, 'seed', 'success', NOW())
ON DUPLICATE KEY UPDATE
  street = VALUES(street),
  number = VALUES(number),
  neighborhood = VALUES(neighborhood),
  city = VALUES(city),
  state = VALUES(state),
  zip_code = VALUES(zip_code),
  formatted_address = VALUES(formatted_address),
  latitude = VALUES(latitude),
  longitude = VALUES(longitude),
  geocoding_provider = VALUES(geocoding_provider),
  geocoding_status = VALUES(geocoding_status),
  geocoded_at = VALUES(geocoded_at);

INSERT IGNORE INTO institution_user (institution_id, user_id, membership_role, status) VALUES
  (2, 4, 'institution_admin', 'active'),
  (3, 5, 'institution_admin', 'active'),
  (4, 6, 'institution_admin', 'active'),
  (5, 7, 'institution_admin', 'active'),
  (6, 8, 'institution_admin', 'active'),
  (7, 9, 'institution_admin', 'active'),
  (2, 10, 'student', 'active'),
  (3, 11, 'student', 'active');

INSERT IGNORE INTO institution_modality (institution_id, modality_id) VALUES
  (2, 1), (2, 4), (2, 5),
  (3, 1), (3, 2), (3, 3), (3, 6),
  (4, 3), (4, 6), (4, 7),
  (5, 1), (5, 5),
  (6, 2), (6, 4), (6, 5),
  (7, 4), (7, 6), (7, 7);

INSERT IGNORE INTO institution_platform_subscriptions (institution_id, plan_id, monthly_fee_cents, status, starts_at, next_billing_at, paid_until, contract_accepted_at, contract_accepted_by) VALUES
  (2, 1, 6900, 'active', '2026-01-01', '2026-06-30', '2026-06-30', NOW(), 4),
  (3, 1, 6900, 'active', '2026-01-01', '2026-06-30', '2026-06-30', NOW(), 5),
  (4, 1, 6900, 'active', '2026-01-01', '2026-06-30', '2026-06-30', NOW(), 6),
  (5, 1, 6900, 'active', '2026-01-01', '2026-06-30', '2026-06-30', NOW(), 7),
  (6, 1, 6900, 'active', '2026-01-01', '2026-06-30', '2026-06-30', NOW(), 8),
  (7, 1, 6900, 'active', '2026-01-01', '2026-06-30', '2026-06-30', NOW(), 9);

INSERT IGNORE INTO classes (id, institution_id, modality_id, title, description, capacity, status) VALUES
  (3, 1, 3, 'Judo Segunda', 'Aula de judo para fundamentos e quedas seguras.', 20, 'active'),
  (4, 1, 1, 'Boxe Tecnico', 'Treino de base, esquiva e combinacoes.', 18, 'active'),
  (5, 2, 1, 'Boxe Manha', 'Boxe para condicionamento e tecnica.', 22, 'active'),
  (6, 2, 4, 'Muay Thai Noite', 'Aula de clinch, chutes e joelhadas.', 24, 'active'),
  (7, 2, 5, 'MMA Fundamentos', 'Transicoes entre luta em pe e solo.', 16, 'active'),
  (8, 3, 2, 'Jiu-Jitsu Iniciante', 'Posicoes basicas e escapes.', 20, 'active'),
  (9, 3, 3, 'Judo Competicao', 'Treino de pegada e nage-waza.', 18, 'active'),
  (10, 3, 6, 'Karate Kata', 'Kihon, kata e kumite controlado.', 18, 'active'),
  (22, 3, 1, 'Boxe Base', 'Boxe tecnico para iniciantes e intermediarios.', 18, 'active'),
  (11, 4, 3, 'Judo Olimpico', 'Treino tecnico para judo esportivo.', 20, 'active'),
  (12, 4, 7, 'Taekwondo Chutes', 'Chutes, defesa e mobilidade.', 20, 'active'),
  (13, 4, 6, 'Karate Esportivo', 'Kumite, distancia e tempo de ataque.', 18, 'active'),
  (14, 5, 1, 'Boxe Vila Sparring Leve', 'Sparring tecnico com controle.', 16, 'active'),
  (15, 5, 5, 'MMA Condicionamento', 'Circuito tecnico de MMA.', 18, 'active'),
  (16, 6, 2, 'Jiu-Jitsu Guarda', 'Passagens e retencao de guarda.', 18, 'active'),
  (17, 6, 5, 'MMA Grappling', 'Quedas e controle de solo.', 18, 'active'),
  (18, 6, 4, 'Muay Thai Tecnico', 'Combinacoes e defesa.', 20, 'active'),
  (19, 7, 7, 'Taekwondo Iniciante', 'Bases, chutes e disciplina.', 22, 'active'),
  (20, 7, 6, 'Karate Adulto', 'Treino de fundamentos e combate controlado.', 18, 'active'),
  (21, 7, 4, 'Muay Thai Sabado', 'Aula de fim de semana para todos os niveis.', 22, 'active');

INSERT IGNORE INTO class_schedules (id, class_id, day_of_week, start_time, end_time, room_name) VALUES
  (3, 3, 1, '18:00:00', '19:00:00', 'Tatame 1'),
  (4, 4, 2, '19:30:00', '20:30:00', 'Ringue'),
  (5, 5, 1, '07:00:00', '08:00:00', 'Ringue 1'),
  (6, 6, 3, '20:00:00', '21:00:00', 'Sala Thai'),
  (7, 7, 5, '19:00:00', '20:30:00', 'Octogono'),
  (8, 8, 2, '18:30:00', '19:30:00', 'Tatame A'),
  (9, 9, 1, '20:00:00', '21:00:00', 'Tatame B'),
  (10, 10, 4, '19:00:00', '20:00:00', 'Sala 2'),
  (22, 22, 5, '18:00:00', '19:00:00', 'Ringue Norte'),
  (11, 11, 3, '18:00:00', '19:00:00', 'Tatame Olimpico'),
  (12, 12, 5, '18:30:00', '19:30:00', 'Quadra 1'),
  (13, 13, 6, '10:00:00', '11:00:00', 'Sala 1'),
  (14, 14, 2, '07:30:00', '08:30:00', 'Ringue Vila'),
  (15, 15, 4, '20:00:00', '21:00:00', 'Area Funcional'),
  (16, 16, 1, '19:00:00', '20:00:00', 'Tatame Azul'),
  (17, 17, 3, '19:30:00', '20:30:00', 'Tatame Preto'),
  (18, 18, 5, '18:00:00', '19:00:00', 'Sala Thai'),
  (19, 19, 2, '18:00:00', '19:00:00', 'Quadra A'),
  (20, 20, 4, '18:30:00', '19:30:00', 'Dojo 1'),
  (21, 21, 6, '09:00:00', '10:00:00', 'Sala Thai');

INSERT IGNORE INTO enrollments (institution_id, student_id, modality_id, status, started_at) VALUES
  (1, 3, 3, 'active', '2026-05-01'),
  (2, 10, 1, 'active', '2026-05-10'),
  (3, 11, 2, 'active', '2026-05-12');

INSERT IGNORE INTO bookings (id, student_id, class_schedule_id, booking_date, status, is_trial, expires_at) VALUES
  (3, 3, 3, '2026-06-01', 'scheduled', 0, NULL),
  (4, 10, 5, '2026-06-01', 'scheduled', 0, NULL),
  (5, 11, 9, '2026-06-01', 'scheduled', 0, NULL);
