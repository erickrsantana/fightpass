const db = require("../database/connection");
const { ApiError } = require("../lib/http");
const { auditLog } = require("../lib/business");

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next.toISOString().slice(0, 10);
}

function makePaymentCode(prefix, id) {
  return `${prefix}${String(id).padStart(10, "0")}FIGHTPASSDOJO`;
}

async function getDojoPlan() {
  const rows = await db.query(
    `SELECT id, code, name, description, price_cents, duration_days
     FROM platform_plans
     WHERE code = 'dojo_monthly' AND audience = 'dojo' AND is_active = 1
     LIMIT 1`
  );

  if (!rows[0]) {
    throw new ApiError(404, "Plano DOJO nao configurado");
  }

  return rows[0];
}

async function getInstitutionSubscription(institutionId) {
  const rows = await db.query(
    `SELECT s.id, s.institution_id, s.monthly_fee_cents, s.status, s.starts_at,
            s.next_billing_at, s.paid_until, s.cancelled_at,
            s.contract_accepted_at, s.contract_accepted_by,
            p.id AS plan_id, p.code AS plan_code, p.name AS plan_name,
            p.description AS plan_description, p.price_cents, p.duration_days
     FROM institution_platform_subscriptions s
     LEFT JOIN platform_plans p ON p.id = s.plan_id
     WHERE s.institution_id = ?
     LIMIT 1`,
    [institutionId]
  );
  return rows[0] || null;
}

async function ensureActiveInstitutionSubscription(institutionId) {
  const subscription = await getInstitutionSubscription(institutionId);
  if (!subscription) {
    throw new ApiError(402, "DOJO sem assinatura ativa na plataforma");
  }

  const paidUntil = subscription.paid_until || subscription.next_billing_at;
  const isExpired = paidUntil && new Date(`${paidUntil}T23:59:59`) < new Date();

  if (subscription.status !== "active" || isExpired) {
    throw new ApiError(402, "Mensalidade do DOJO pendente. Regularize o plano para gerenciar aulas");
  }

  return subscription;
}

async function ensureSubscriptionExists(institutionId, connection = null) {
  const existing = await getInstitutionSubscription(institutionId);
  if (existing) return existing;

  const plan = await getDojoPlan();
  const executor = connection || db;
  await executor.query(
    `INSERT INTO institution_platform_subscriptions
       (institution_id, plan_id, monthly_fee_cents, status, starts_at, next_billing_at, paid_until)
     VALUES (?, ?, ?, 'inactive', CURDATE(), NULL, NULL)`,
    [institutionId, plan.id, plan.price_cents]
  );

  return getInstitutionSubscription(institutionId);
}

async function createDojoPaymentSimulation({ institutionId, method, userId, contractAccepted }) {
  if (!contractAccepted) {
    throw new ApiError(422, "Aceite do contrato obrigatorio para assinar o Plano DOJO");
  }

  const plan = await getDojoPlan();
  const connection = await db.pool.getConnection();

  try {
    await connection.beginTransaction();
    const [insert] = await connection.execute(
      `INSERT INTO dojo_payment_simulations
         (institution_id, plan_id, method, amount_cents, contract_accepted, contract_accepted_at, contract_text_version, status)
       VALUES (?, ?, ?, ?, 1, NOW(), 'dojo_terms_v1', 'pending')`,
      [institutionId, plan.id, method, plan.price_cents]
    );

    const code = method === "pix"
      ? makePaymentCode("PIXDOJO", insert.insertId)
      : makePaymentCode("23790", insert.insertId);

    await connection.execute(
      method === "pix"
        ? "UPDATE dojo_payment_simulations SET pix_code = ? WHERE id = ?"
        : "UPDATE dojo_payment_simulations SET boleto_code = ? WHERE id = ?",
      [code, insert.insertId]
    );

    await auditLog(userId, "dojo.payment_simulation.create", "dojo_payment_simulations", insert.insertId, {
      institutionId,
      method,
      amountCents: plan.price_cents
    }, connection);

    await connection.commit();

    return {
      id: insert.insertId,
      institutionId,
      planId: plan.id,
      method,
      amountCents: plan.price_cents,
      status: "pending",
      contractAccepted: true,
      contractTextVersion: "dojo_terms_v1",
      pixCode: method === "pix" ? code : null,
      boletoCode: method === "boleto" ? code : null,
      prototypeNotice: "Pagamento ficticio para demonstracao academica. Nenhuma cobranca real sera executada."
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function confirmDojoPayment(paymentId, userId) {
  const rows = await db.query(
    `SELECT dp.id, dp.institution_id, dp.plan_id, dp.status, pp.duration_days, pp.price_cents,
            dp.contract_accepted
     FROM dojo_payment_simulations dp
     INNER JOIN platform_plans pp ON pp.id = dp.plan_id
     WHERE dp.id = ?
     LIMIT 1`,
    [paymentId]
  );
  const payment = rows[0];

  if (!payment) {
    throw new ApiError(404, "Pagamento DOJO nao encontrado");
  }

  if (payment.status === "paid") {
    throw new ApiError(409, "Pagamento DOJO ja confirmado");
  }

  if (!payment.contract_accepted) {
    throw new ApiError(422, "Contrato do Plano DOJO nao foi aceito");
  }

  const today = new Date();
  const paidUntil = addDays(today, payment.duration_days);
  const connection = await db.pool.getConnection();

  try {
    await connection.beginTransaction();
    await connection.execute(
      "UPDATE dojo_payment_simulations SET status = 'paid', paid_at = NOW() WHERE id = ?",
      [payment.id]
    );
    await connection.execute(
      `INSERT INTO institution_platform_subscriptions
         (institution_id, plan_id, monthly_fee_cents, status, starts_at, next_billing_at, paid_until, contract_accepted_at, contract_accepted_by)
       VALUES (?, ?, ?, 'active', CURDATE(), ?, ?, NOW(), ?)
       ON DUPLICATE KEY UPDATE
         plan_id = VALUES(plan_id),
         monthly_fee_cents = VALUES(monthly_fee_cents),
         status = 'active',
         next_billing_at = VALUES(next_billing_at),
         paid_until = VALUES(paid_until),
         cancelled_at = NULL,
         contract_accepted_at = NOW(),
         contract_accepted_by = ?`,
      [payment.institution_id, payment.plan_id, payment.price_cents, paidUntil, paidUntil, userId, userId]
    );
    await auditLog(userId, "dojo.payment_simulation.confirm", "dojo_payment_simulations", payment.id, {
      institutionId: payment.institution_id,
      paidUntil
    }, connection);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  return getInstitutionSubscription(payment.institution_id);
}

module.exports = {
  getDojoPlan,
  getInstitutionSubscription,
  ensureActiveInstitutionSubscription,
  ensureSubscriptionExists,
  createDojoPaymentSimulation,
  confirmDojoPayment
};
