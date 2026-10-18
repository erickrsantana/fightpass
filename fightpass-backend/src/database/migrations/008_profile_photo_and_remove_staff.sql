-- Foto de perfil enviada do aparelho (guardada como imagem pequena em texto)
ALTER TABLE users MODIFY avatar_url MEDIUMTEXT NULL;

-- O perfil "staff" deixa de existir (so 4 tipos: aluno, instrutor, academia, FightPass)
DELETE FROM roles WHERE code = 'staff' AND id NOT IN (SELECT role_id FROM users);
