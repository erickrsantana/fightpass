try { require("dotenv").config(); } catch (error) { /* sem dotenv, usa o ambiente */ }

const db = require("../src/database/connection");
const { hashPassword } = require("../src/lib/http");

const EMAIL = "admin@fightpass.com";
const PASSWORD = "FightPass123";
const NAME = "Administrador FightPass";
const DOCUMENT = "FIGHTPASS-ADM";

async function main() {
  const roles = await db.query("SELECT id FROM roles WHERE code = 'platform_admin' LIMIT 1");
  if (!roles[0]) throw new Error("Perfil platform_admin nao existe. Rode o INSERT em roles primeiro.");

  const passwordHash = await hashPassword(PASSWORD);
  const existing = await db.query("SELECT id FROM users WHERE email = ? LIMIT 1", [EMAIL]);

  if (existing[0]) {
    await db.query("UPDATE users SET role_id = ?, password_hash = ?, is_active = 1 WHERE id = ?", [roles[0].id, passwordHash, existing[0].id]);
    console.log("Conta FightPass atualizada:", EMAIL);
  } else {
    await db.query(
      "INSERT INTO users (role_id, name, email, password_hash, document, is_active) VALUES (?, ?, ?, ?, ?, 1)",
      [roles[0].id, NAME, EMAIL, passwordHash, DOCUMENT]
    );
    console.log("Conta FightPass criada:", EMAIL);
  }
  console.log("Senha:", PASSWORD);
}

main()
  .catch((error) => { console.error("Erro:", error.message); process.exitCode = 1; })
  .finally(() => process.exit());