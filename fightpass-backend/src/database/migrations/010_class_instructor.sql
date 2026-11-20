-- Cada turma/modalidade tem um professor responsavel (so ele faz a chamada dela)
-- Versao segura para rodar mais de uma vez (nao falha se a coluna/chave ja existir).
SET @db = DATABASE();

SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='classes' AND COLUMN_NAME='instructor_id')=0,
  'ALTER TABLE classes ADD COLUMN instructor_id BIGINT UNSIGNED NULL AFTER modality_id', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='classes' AND CONSTRAINT_NAME='fk_classes_instructor')=0,
  'ALTER TABLE classes ADD CONSTRAINT fk_classes_instructor FOREIGN KEY (instructor_id) REFERENCES users(id)', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- Demonstracao: as turmas ja existentes do Dojo Sakura passam a ser do professor Carlos
UPDATE classes
SET instructor_id = (SELECT id FROM users WHERE email = 'carlos@dojosakura.com' LIMIT 1)
WHERE instructor_id IS NULL
  AND institution_id IN (SELECT id FROM institutions WHERE name LIKE '%Sakura%');
