
UPDATE institutions SET
  name = 'Projeto Academia Senac',
  description = 'Academia dentro do campus do Senac Nacoes Unidas, com aulas de lutas e condicionamento para alunos e comunidade.'
WHERE id = 1;

UPDATE institutions SET
  name = 'Peralta Fitness Marajoara',
  description = 'Academia completa no Jardim Marajoara, com musculacao, jiu-jitsu, muay thai, boxe e outras modalidades.'
WHERE id = 2;

UPDATE institutions SET
  name = 'Clube Paulista de Judo',
  description = 'Escola de judo na Praca Horacio Bortz, ao lado do Senac Nacoes Unidas, com aulas para todas as idades e niveis.'
WHERE id = 3;

UPDATE institutions SET
  name = 'Dojo Jurubatuba',
  description = 'Espaco de artes marciais proximo a estacao Jurubatuba (nome ficticio para demonstracao).'
WHERE id = 4;

UPDATE institutions SET
  name = 'Tatame Chacara Santo Antonio',
  description = 'Jiu-jitsu, karate e taekwondo na regiao da Chacara Santo Antonio (nome ficticio para demonstracao).'
WHERE id = 5;

UPDATE institutions SET
  name = 'Campo Belo Fight Club',
  description = 'Boxe, MMA e muay thai no Campo Belo (nome ficticio para demonstracao).'
WHERE id = 6;

UPDATE institutions SET
  name = 'Centro de Lutas Interlagos',
  description = 'Taekwondo, karate e muay thai na regiao de Interlagos (nome ficticio para demonstracao).'
WHERE id = 7;

INSERT INTO addresses
  (institution_id, street, number, neighborhood, city, state, zip_code, formatted_address, latitude, longitude, geocoding_provider, geocoding_status, geocoded_at)
VALUES
  (1, 'Avenida Engenheiro Eusebio Stevaux', '823', 'Santo Amaro', 'Sao Paulo', 'SP', '04696-000', 'Avenida Engenheiro Eusebio Stevaux, 823 - Santo Amaro - Sao Paulo - SP - 04696-000', -23.6535000, -46.7075000, 'seed', 'success', NOW()),
  (2, 'Avenida Sargento Lourival Alves de Souza', '90', 'Jardim Marajoara', 'Sao Paulo', 'SP', '04675-020', 'Avenida Sargento Lourival Alves de Souza, 90 - Jardim Marajoara - Sao Paulo - SP - 04675-020', -23.6745000, -46.7195000, 'seed', 'success', NOW()),
  (3, 'Praca Horacio Bortz', 's/n', 'Jurubatuba', 'Sao Paulo', 'SP', '04675-180', 'Praca Horacio Bortz - Jurubatuba - Sao Paulo - SP - 04675-180', -23.6530000, -46.7068000, 'seed', 'success', NOW()),
  (4, 'Avenida Engenheiro Eusebio Stevaux', '1000', 'Jurubatuba', 'Sao Paulo', 'SP', '04696-000', 'Regiao da estacao Jurubatuba - Sao Paulo - SP', -23.6490000, -46.7030000, 'seed', 'success', NOW()),
  (5, 'Rua Verbo Divino', '1500', 'Chacara Santo Antonio', 'Sao Paulo', 'SP', '04719-002', 'Rua Verbo Divino - Chacara Santo Antonio - Sao Paulo - SP', -23.6380000, -46.7000000, 'seed', 'success', NOW()),
  (6, 'Avenida Washington Luis', '1000', 'Campo Belo', 'Sao Paulo', 'SP', '04627-001', 'Avenida Washington Luis - Campo Belo - Sao Paulo - SP', -23.6270000, -46.6700000, 'seed', 'success', NOW()),
  (7, 'Avenida Interlagos', '2000', 'Interlagos', 'Sao Paulo', 'SP', '04661-100', 'Avenida Interlagos - Interlagos - Sao Paulo - SP', -23.6800000, -46.6900000, 'seed', 'success', NOW())
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