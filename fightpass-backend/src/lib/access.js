const crypto = require("crypto");
const db = require("../database/connection");
const { ApiError } = require("./http");

const TRIAL_DURATION_HOURS = 24;

async function runQuery(executor, sql, params = []) {
  if (executor && typeof executor.execute === "function") {
    const [rows] = await executor.execute(sql, params);
    return rows;
  }
  return executor.query(sql, params);
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function isValidCpf(value) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) {
    return false;
  }

  const calcDigit = (length) => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += Number(cpf[index]) * (length + 1 - index);
    }
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  return calcDigit(9) === Number(cpf[9]) && calcDigit(10) === Number(cpf[10]);
}

async function getPlanByCode(code, connection = null) {
  const executor = connection || db;
  const rows = await runQuery(
    executor,
    "SELECT id, code, name, description, price_cents, session_limit, duration_days, is_active FROM access_plans WHERE code = ? LIMIT 1",
    [code]
  );
  return rows[0] || null;
}

async function createTrialAccess({ userId, document }, connection) {
  const documentDigits = onlyDigits(document);
  const trialPlan = await getPlanByCode("trial_1_day", connection);
  if (!trialPlan) {
    throw new ApiError(500, "Plano de teste nao configurado");
  }

  const [trialRows] = await connection.execute(
    "SELECT id FROM student_trial_uses WHERE document = ? LIMIT 1",
    [documentDigits]
  );

  if (trialRows[0]) {
    throw new ApiError(409, "Este CPF ja utilizou o plano de teste");
  }

  const [passResult] = await connection.execute(
    `INSERT INTO student_access_passes
       (student_id, plan_id, source, status, starts_at, expires_at, sessions_total, sessions_used)
     VALUES (?, ?, 'trial', 'active', NOW(), DATE_ADD(NOW(), INTERVAL ? HOUR), ?, 0)`,
    [userId, trialPlan.id, TRIAL_DURATION_HOURS, trialPlan.session_limit]
  );

  await connection.execute(
    `INSERT INTO student_trial_uses (document, student_id, access_pass_id, started_at, expires_at)
     VALUES (?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL ? HOUR))`,
    [documentDigits, userId, passResult.insertId, TRIAL_DURATION_HOURS]
  );

  return {
    accessPassId: passResult.insertId,
    trialExpiresAt: new Date(Date.now() + TRIAL_DURATION_HOURS * 60 * 60 * 1000)
  };
}

async function expireOldAccessPasses(studentId, connection = null) {
  const executor = connection || db;
  await runQuery(
    executor,
    `UPDATE student_access_passes
     SET status = 'expired'
     WHERE student_id = ?
       AND status = 'active'
       AND expires_at <= NOW()`,
    [studentId]
  );
}

async function getActiveAccessPass(studentId, requiredSessions = 1, connection = null) {
  const executor = connection || db;
  await expireOldAccessPasses(studentId, connection);

  const rows = await runQuery(
    executor,
    `SELECT sap.id, sap.student_id, sap.plan_id, sap.source, sap.status, sap.starts_at, sap.expires_at,
            sap.sessions_total, sap.sessions_used,
            ap.code AS plan_code, ap.name AS plan_name, ap.description AS plan_description,
            ap.price_cents, ap.session_limit
     FROM student_access_passes sap
     INNER JOIN access_plans ap ON ap.id = sap.plan_id
     WHERE sap.student_id = ?
       AND sap.status = 'active'
       AND sap.starts_at <= NOW()
       AND sap.expires_at > NOW()
       AND (sap.sessions_total IS NULL OR sap.sessions_used + ? <= sap.sessions_total)
     ORDER BY sap.expires_at DESC, sap.id DESC
     LIMIT 1`,
    [studentId, requiredSessions]
  );

  return rows[0] || null;
}

async function ensureStudentAccess(studentId, requiredSessions = 1, connection = null) {
  const pass = await getActiveAccessPass(studentId, requiredSessions, connection);
  if (!pass) {
    throw new ApiError(
      402,
      "Seu periodo de teste terminou ou seu plano nao possui treinos disponiveis. Contrate um plano para continuar usando o FightPass."
    );
  }
  return pass;
}

async function reserveAccessUsage({ accessPassId, bookingIds }, connection) {
  if (!bookingIds.length) return;

  await connection.execute(
    `UPDATE student_access_passes
     SET sessions_used = sessions_used + ?
     WHERE id = ?`,
    [bookingIds.length, accessPassId]
  );

  for (const bookingId of bookingIds) {
    await connection.execute(
      "INSERT INTO access_pass_usage (access_pass_id, booking_id) VALUES (?, ?)",
      [accessPassId, bookingId]
    );
  }
}

async function releaseAccessUsageForBooking(bookingId) {
  const connection = await db.pool.getConnection();

  try {
    await connection.beginTransaction();
    const [usageRows] = await connection.execute(
      "SELECT id, access_pass_id FROM access_pass_usage WHERE booking_id = ? LIMIT 1",
      [bookingId]
    );

    const usage = usageRows[0];
    if (usage) {
      await connection.execute(
        "UPDATE student_access_passes SET sessions_used = GREATEST(sessions_used - 1, 0) WHERE id = ?",
        [usage.access_pass_id]
      );
      await connection.execute("DELETE FROM access_pass_usage WHERE id = ?", [usage.id]);
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

function buildPixCode({ paymentId, amountCents }) {
  return [
    "000201",
    "26360014BR.GOV.BCB.PIX",
    `520400005303986540${(amountCents / 100).toFixed(2)}`,
    "5802BR",
    "5910FIGHTPASS",
    "6009SAO PAULO",
    `62140510FP${String(paymentId).padStart(8, "0")}`,
    "6304FICT"
  ].join("");
}

function buildBoletoCode(paymentId) {
  const left = String(paymentId).padStart(10, "0");
  const random = crypto.randomInt(1000000000, 9999999999);
  return `23790.00009 ${left.slice(0, 5)}.${left.slice(5)} ${random.toString().slice(0, 5)}.${random.toString().slice(5)} 1 00000000000000`;
}

module.exports = {
  onlyDigits,
  isValidCpf,
  createTrialAccess,
  getActiveAccessPass,
  ensureStudentAccess,
  reserveAccessUsage,
  releaseAccessUsageForBooking,
  buildPixCode,
  buildBoletoCode
};
