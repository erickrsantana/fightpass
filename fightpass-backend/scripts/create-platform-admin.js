try { require("dotenv").config(); } catch (error) { /* sem dotenv, usa o ambiente */ }

const db = require("../src/database/connection");
const { hashPassword } = require("../src/lib/http");

// Uso (defina antes no terminal; a senha NAO fica salva em arquivo):
//   set ADMIN_EMAIL=seu-email@gmail.com
//   set ADMIN_PASSWORD=uma-senha-forte-com-12-ou-mais-caracteres
//   npm run create:admin
const EMAIL = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const PASSWORD = String(process.env.ADMIN_PASSWORD || "");
const NAME = process.env.ADMIN_NAME || "Administrador FightPass";
const DOCUMENT = "FIGHTPASS-ADM";

if (!EMAIL || !EMAIL.includes("@")) {
  console.error("Defina ADMIN_EMAIL (set ADMIN_EMAIL=seu-email@gmail.com).");
  process.exit(1);
}
if (PASSWORD.length < 12) {
  console.error("Defina ADMIN_PASSWORD com 12 ou mais caracteres.");
  process.exit(1);
}

async function main() {
  const roles = await db.query("SELECT id FROM roles WHERE code = 'platform_admin' LIMIT 1");
  if (!roles[0]) throw new Error("Perfil platform_admin nao existe. Rode o INSERT em roles primeiro.");

  const passwordHash = await hashPassword(PASSWORD);
  const existing = await db.query("SELECT id FROM users WHERE email = ? OR document = ? LIMIT 1", [EMAIL, DOCUMENT]);

  if (existing[0]) {
    await db.query("UPDATE users SET role_id = ?, email = ?, name = ?, password_hash = ?, is_active = 1 WHERE id = ?", [roles[0].id, EMAIL, NAME, passwordHash, existing[0].id]);
    console.log("Conta FightPass atualizada:", EMAIL);
  } else {
    await db.query(
      "INSERT INTO users (role_id, name, email, password_hash, document, is_active) VALUES (?, ?, ?, ?, ?, 1)",
      [roles[0].id, NAME, EMAIL, passwordHash, DOCUMENT]
    );
    console.log("Conta FightPass criada:", EMAIL);
  }
  console.log("Senha definida (nao exibida). O login pedira o codigo enviado a este e-mail.");
}

main()
  .catch((error) => { console.error("Erro:", error.message); process.exitCode = 1; })
  .finally(() => process.exit());