INSERT INTO modalities (name, slug, description) VALUES
  ('Boxe', 'boxe', 'Treinamento de boxe'),
  ('Jiu-Jitsu', 'jiu-jitsu', 'Treinamento de jiu-jitsu'),
  ('Judo', 'judo', 'Treinamento de judo'),
  ('Muay Thai', 'muay-thai', 'Treinamento de muay thai'),
  ('MMA', 'mma', 'Treinamento de artes marciais mistas'),
  ('Karate', 'karate', 'Treinamento de karate'),
  ('Taekwondo', 'taekwondo', 'Treinamento de taekwondo')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description);
