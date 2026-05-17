const crypto = require("crypto");
const db = require("../database/connection");
const { ApiError, hashPassword } = require("../lib/http");
const { auditLog } = require("../lib/business");
const { sendPasswordResetEmail } = require("../lib/email");

const RESET_TTL_MINUTES = 30;

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function requestPasswordReset(user, metadata = {}) {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000);

  await db.query(
    `DELETE FROM password_reset_tokens
     WHERE user_id = ? AND (used_at IS NOT NULL OR expires_at < NOW())`,
    [user.id]
  );

  await db.query(
    `INSERT INTO password_reset_tokens
       (user_id, email, token_hash, expires_at, request_ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      user.id,
      user.email,
      tokenHash,
      expiresAt,
      metadata.ip || null,
      metadata.userAgent || null
    ]
  );

  const emailResult = await sendPasswordResetEmail({
    to: user.email,
    name: user.name,
    token
  });

  await auditLog(user.id, "auth.forgot_password", "users", user.id, {
    emailSent: !emailResult.skipped,
    emailSkippedReason: emailResult.skipped ? emailResult.reason : null
  });

  return emailResult;
}

async function resetPassword(token, password) {
  const tokenHash = hashToken(token);
  const rows = await db.query(
    `SELECT prt.id, prt.user_id, prt.email, prt.expires_at, prt.used_at, u.id AS found_user_id
     FROM password_reset_tokens prt
     INNER JOIN users u ON u.id = prt.user_id
     WHERE prt.token_hash = ?
     LIMIT 1`,
    [tokenHash]
  );
  const resetToken = rows[0];

  if (!resetToken || resetToken.used_at) {
    throw new ApiError(400, "Token de redefinicao invalido");
  }

  if (new Date(resetToken.expires_at) < new Date()) {
    throw new ApiError(400, "Token de redefinicao expirado");
  }

  const passwordHash = await hashPassword(password);
  const connection = await db.pool.getConnection();

  try {
    await connection.beginTransaction();
    await connection.execute(
      "UPDATE users SET password_hash = ? WHERE id = ?",
      [passwordHash, resetToken.user_id]
    );
    await connection.execute(
      "UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ?",
      [resetToken.id]
    );
    await connection.execute(
      "DELETE FROM password_reset_tokens WHERE user_id = ? AND id <> ?",
      [resetToken.user_id, resetToken.id]
    );
    await auditLog(resetToken.user_id, "auth.reset_password", "users", resetToken.user_id, null, connection);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  requestPasswordReset,
  resetPassword
};
