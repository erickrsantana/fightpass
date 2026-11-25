const db = require("../database/connection");
const env = require("../config/env");
const { ApiError, invalidateAuthCache } = require("../lib/http");
const { auditLog } = require("../lib/business");
const { sendVerificationEmail } = require("../lib/email");
const { generateNumericCode, hashVerificationCode, safeEqual } = require("../lib/security");

// Cria um codigo novo (invalida os anteriores) e envia por e-mail.
async function issueVerificationCode(user, metadata = {}, connection = null) {
  const executor = connection ? (sql, params) => connection.execute(sql, params).then(([r]) => r) : db.query;
  const code = generateNumericCode(6);
  const expiresAt = new Date(Date.now() + env.emailVerification.ttlMinutes * 60 * 1000);

  await executor("DELETE FROM email_verification_codes WHERE user_id = ?", [user.id]);
  await executor(
    `INSERT INTO email_verification_codes (user_id, email, code_hash, expires_at, request_ip)
     VALUES (?, ?, ?, ?, ?)`,
    [user.id, user.email, hashVerificationCode(code, user.id, env.jwt.secret), expiresAt, metadata.ip || null]
  );
  return code;
}

async function sendCode(user, code, purpose = "register") {
  try {
    const result = await sendVerificationEmail({ to: user.email, name: user.name, code, purpose });
    if (result.skipped) console.warn(`[email] Verificação sem envio: ${result.reason}`);
    return result;
  } catch (error) {
    console.error("[email] Falha ao enviar código de verificação:", error.message);
    if (!env.isProduction) console.log(`[email] (modo desenvolvimento) Código de ${purpose} para ${user.email}: ${code}`);
    return { skipped: true, reason: "falha no envio" };
  }
}

async function findUnverifiedUser(email) {
  const rows = await db.query(
    `SELECT u.id, u.name, u.email, u.email_verified_at, u.is_active, r.code AS role
     FROM users u INNER JOIN roles r ON r.id = u.role_id
     WHERE u.email = ? LIMIT 1`,
    [email]
  );
  return rows[0] || null;
}

// Confere o codigo. Erra de forma generica para nao revelar se o e-mail existe.
async function verifyEmailCode(email, code) {
  const invalid = () => new ApiError(400, "Código inválido ou expirado");
  const user = await findUnverifiedUser(email);
  if (!user || !user.is_active) throw invalid();

  const rows = await db.query(
    `SELECT id, code_hash, expires_at, attempts, used_at
     FROM email_verification_codes
     WHERE user_id = ? ORDER BY id DESC LIMIT 1`,
    [user.id]
  );
  const record = rows[0];
  if (!record || record.used_at) throw invalid();

  if (new Date(record.expires_at) < new Date()) throw new ApiError(400, "Código expirado. Solicite um novo código.");
  if (record.attempts >= env.emailVerification.maxAttempts) {
    throw new ApiError(429, "Muitas tentativas. Solicite um novo código.");
  }

  const expected = hashVerificationCode(String(code), user.id, env.jwt.secret);
  if (!safeEqual(expected, record.code_hash)) {
    await db.query("UPDATE email_verification_codes SET attempts = attempts + 1 WHERE id = ?", [record.id]);
    throw invalid();
  }

  await db.query("UPDATE email_verification_codes SET used_at = NOW() WHERE id = ?", [record.id]);
  if (!user.email_verified_at) {
    await db.query("UPDATE users SET email_verified_at = NOW() WHERE id = ?", [user.id]);
    await auditLog(user.id, "auth.email_verified", "users", user.id);
  }
  invalidateAuthCache(user.id);
  return user;
}

// Reenvio com intervalo minimo. So vale se ja existe um desafio em andamento (aberto pelo cadastro ou por um login
// com a senha correta nos ultimos 30 minutos): assim, quem nao sabe a senha nao consegue gerar codigos para adivinhar.
async function resendVerificationCode(email, metadata = {}) {
  const user = await findUnverifiedUser(email);
  if (!user || !user.is_active) return { sent: false };

  const rows = await db.query(
    "SELECT created_at, used_at FROM email_verification_codes WHERE user_id = ? ORDER BY id DESC LIMIT 1",
    [user.id]
  );
  const last = rows[0];
  if (!last || last.used_at) return { sent: false };
  const elapsed = (Date.now() - new Date(last.created_at).getTime()) / 1000;
  if (elapsed > 30 * 60) return { sent: false };
  if (elapsed < env.emailVerification.resendCooldownSeconds) {
    throw new ApiError(429, `Aguarde ${Math.ceil(env.emailVerification.resendCooldownSeconds - elapsed)} segundos para pedir um novo código`);
  }

  const code = await issueVerificationCode(user, metadata);
  await sendCode(user, code, user.email_verified_at ? "login" : "register");
  return { sent: true };
}

module.exports = {
  issueVerificationCode,
  sendCode,
  verifyEmailCode,
  resendVerificationCode
};
