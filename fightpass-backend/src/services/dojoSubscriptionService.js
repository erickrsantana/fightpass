const db = require("../database/connection");
const { ApiError } = require("../lib/http");
const { auditLog } = require("../lib/business");
const { ensureTermsAccepted } = require("./termsService");
const { validateCard, makeReceiptCode, PIX_TTL_MINUTES, BOLETO_TTL_DAYS, MAX_INSTALLMENTS } = require("../lib/cardPayments");
const mercadoPago = require("../lib/mercadopago");
const env = require("../config/env");

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
    throw new ApiError(404, "Plano DOJO não configurado");
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

async function createDojoPaymentSimulation({ institutionId, method, userId, termsAccepted, termsVersion, ipAddress, userAgent, card, installments }) {
  if (env.payments.mode === "gateway") {
    throw new ApiError(403, "Pagamento simulado desativado. Use o pagamento online.");
  }
  const plan = await getDojoPlan();
  const isCard = method === "credit_card" || method === "debit_card";
  const cardInfo = isCard ? validateCard(card) : null;
  const parcels = method === "credit_card" ? Math.min(Math.max(Number(installments) || 1, 1), MAX_INSTALLMENTS) : 1;
  const expiresAt = method === "pix"
    ? new Date(Date.now() + PIX_TTL_MINUTES * 60 * 1000)
    : method === "boleto"
      ? new Date(Date.now() + BOLETO_TTL_DAYS * 24 * 60 * 60 * 1000)
      : null;
  const connection = await db.pool.getConnection();

  try {
    await connection.beginTransaction();
    const termsAcceptance = await ensureTermsAccepted({
      userId,
      accepted: termsAccepted,
      version: termsVersion,
      origin: "contratacao_plano",
      ipAddress,
      userAgent
    }, connection);

    const [insert] = await connection.execute(
      `INSERT INTO dojo_payment_simulations
         (institution_id, plan_id, method, amount_cents, installments, card_brand, card_last4, expires_at,
          terms_acceptance_id, contract_accepted, contract_accepted_at, contract_text_version, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), ?, 'pending')`,
      [institutionId, plan.id, method, plan.price_cents, parcels,
        cardInfo ? cardInfo.brand : null, cardInfo ? cardInfo.last4 : null, expiresAt,
        termsAcceptance.id, termsVersion]
    );

    const code = method === "pix"
      ? makePaymentCode("PIXDOJO", insert.insertId)
      : method === "boleto"
        ? makePaymentCode("23790", insert.insertId)
        : makePaymentCode(`${method.toUpperCase().replace("_", "")}`, insert.insertId);

    if (method === "pix" || method === "boleto") {
      await connection.execute(
        method === "pix"
          ? "UPDATE dojo_payment_simulations SET pix_code = ? WHERE id = ?"
          : "UPDATE dojo_payment_simulations SET boleto_code = ? WHERE id = ?",
        [code, insert.insertId]
      );
    }

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
      termsAcceptanceId: termsAcceptance.id,
      status: "pending",
      contractAccepted: true,
      contractTextVersion: termsVersion,
      installments: parcels,
      cardBrand: cardInfo ? cardInfo.brand : null,
      cardLast4: cardInfo ? cardInfo.last4 : null,
      expiresAt,
      pixCode: method === "pix" ? code : null,
      boletoCode: method === "boleto" ? code : null,
      referenceCode: method !== "pix" && method !== "boleto" ? code : null,
      prototypeNotice: "Pagamento fictício para demonstração acadêmica. Nenhuma cobrança real será executada."
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// Cobranca real do Plano DOJO pelo Mercado Pago (o valor vem do banco, nunca do navegador).
async function createDojoGatewayPayment({ institutionId, userId, userEmail, termsAccepted, termsVersion, ipAddress, userAgent }) {
  if (env.payments.mode !== "gateway") throw new ApiError(409, "Pagamento online não está ativado neste ambiente");
  if (!mercadoPago.isConfigured()) throw new ApiError(503, "Pagamento online indisponível no momento");

  const plan = await getDojoPlan();
  const connection = await db.pool.getConnection();
  let paymentId;

  try {
    await connection.beginTransaction();
    const termsAcceptance = await ensureTermsAccepted({
      userId,
      accepted: termsAccepted,
      version: termsVersion,
      origin: "contratacao_plano",
      ipAddress,
      userAgent
    }, connection);

    const [insert] = await connection.execute(
      `INSERT INTO dojo_payment_simulations
         (institution_id, plan_id, method, amount_cents, installments, terms_acceptance_id,
          contract_accepted, contract_accepted_at, contract_text_version, status, gateway_provider)
       VALUES (?, ?, 'gateway', ?, 1, ?, 1, NOW(), ?, 'pending', 'mercadopago')`,
      [institutionId, plan.id, plan.price_cents, termsAcceptance.id, termsVersion]
    );
    paymentId = insert.insertId;
    await auditLog(userId, "dojo.payment_checkout_created", "dojo_payment_simulations", paymentId, {
      institutionId, amountCents: plan.price_cents, provider: "mercadopago"
    }, connection);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  try {
    const preference = await mercadoPago.createPreference({
      title: `FightPass - ${plan.name}`,
      amountCents: plan.price_cents,
      externalReference: `D-${paymentId}`,
      payerEmail: userEmail,
      backPath: "meus-pagamentos.html"
    });
    await db.query(
      "UPDATE dojo_payment_simulations SET gateway_preference_id = ?, gateway_checkout_url = ? WHERE id = ?",
      [preference.preferenceId, preference.checkoutUrl, paymentId]
    );
    return { id: paymentId, amountCents: plan.price_cents, checkoutUrl: preference.checkoutUrl, status: "pending" };
  } catch (error) {
    await db.query("UPDATE dojo_payment_simulations SET status = 'cancelled' WHERE id = ?", [paymentId]);
    throw error;
  }
}

// Ativa a assinatura DOJO. Fluxo simulado: gestor confirma. Fluxo gateway: webhook do Mercado Pago.
async function activateDojoPayment({ paymentId, userId = null, gateway = false, gatewayPaymentId = null }) {
  const connection = await db.pool.getConnection();

  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT dp.id, dp.institution_id, dp.plan_id, dp.status, dp.method, dp.expires_at, pp.duration_days, pp.price_cents,
              dp.contract_accepted, dp.terms_acceptance_id, i.owner_user_id
       FROM dojo_payment_simulations dp
       INNER JOIN platform_plans pp ON pp.id = dp.plan_id
       INNER JOIN institutions i ON i.id = dp.institution_id
       WHERE dp.id = ?
       LIMIT 1
       FOR UPDATE`,
      [paymentId]
    );
    const payment = rows[0];

    if (!payment) throw new ApiError(404, "Pagamento DOJO não encontrado");
    if (!gateway && payment.method === "gateway") {
      throw new ApiError(403, "Esta cobrança só é confirmada pelo gateway de pagamento");
    }
    if (payment.status === "paid") {
      if (gateway) { await connection.commit(); return { paymentId: payment.id, alreadyPaid: true }; }
      throw new ApiError(409, "Pagamento DOJO já confirmado");
    }
    if (payment.status === "cancelled" && !gateway) throw new ApiError(409, "Cobrança cancelada");
    if (!gateway && payment.expires_at && new Date(payment.expires_at) < new Date()) {
      throw new ApiError(410, "Cobrança expirada. Gere uma nova.");
    }
    if (!payment.contract_accepted || !payment.terms_acceptance_id) {
      throw new ApiError(422, "Termos de Uso do Plano DOJO não foram aceitos");
    }

    const actor = userId || payment.owner_user_id;
    const paidUntil = addDays(new Date(), payment.duration_days);

    await connection.execute(
      `UPDATE dojo_payment_simulations
       SET status = 'paid', paid_at = NOW(), receipt_code = ?,
           gateway_payment_id = COALESCE(?, gateway_payment_id), gateway_status = IF(? IS NULL, gateway_status, 'approved')
       WHERE id = ?`,
      [makeReceiptCode(payment.id).replace("FP-", "FP-DOJO-"), gatewayPaymentId, gatewayPaymentId, payment.id]
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
      [payment.institution_id, payment.plan_id, payment.price_cents, paidUntil, paidUntil, actor, actor]
    );
    await auditLog(actor, gateway ? "dojo.payment_gateway_approved" : "dojo.payment_simulation.confirm", "dojo_payment_simulations", payment.id, {
      institutionId: payment.institution_id,
      paidUntil,
      gatewayPaymentId
    }, connection);
    await connection.commit();
    return { paymentId: payment.id, institutionId: payment.institution_id };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function confirmDojoPayment(paymentId, userId) {
  if (env.payments.mode === "gateway") {
    throw new ApiError(403, "Pagamento simulado desativado. Use o pagamento online.");
  }
  const result = await activateDojoPayment({ paymentId, userId });
  return getInstitutionSubscription(result.institutionId);
}

module.exports = {
  getDojoPlan,
  getInstitutionSubscription,
  ensureActiveInstitutionSubscription,
  ensureSubscriptionExists,
  createDojoPaymentSimulation,
  createDojoGatewayPayment,
  activateDojoPayment,
  confirmDojoPayment
};
