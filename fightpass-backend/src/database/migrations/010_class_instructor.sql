-- Cada turma/modalidade tem um professor responsavel (so ele faz a chamada dela)
ALTER TABLE classes
  ADD COLUMN instructor_id BIGINT UNSIGNED NULL AFTER modality_id,
  ADD CONSTRAINT fk_classes_instructor FOREIGN KEY (instructor_id) REFERENCES users(id);

-- Demonstracao: as turmas ja existentes do Dojo Sakura passam a ser do professor Carlos
UPDATE classes
SET instructor_id = (SELECT id FROM users WHERE email = 'carlos@dojosakura.com' LIMIT 1)
WHERE instructor_id IS NULL
  AND institution_id IN (SELECT id FROM institutions WHERE name LIKE '%Sakura%');
