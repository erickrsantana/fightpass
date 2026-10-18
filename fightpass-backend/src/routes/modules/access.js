const express = require("express");
const { body } = require("express-validator");
const db = require("../../database/connection");
const {
  ApiError,
  asyncHandler,
  success,
  created,
  validateRequest,
  auth
} = require("../../lib/http");
const { auditLog } = require("../../lib/business");
const {
  getActiveAccessPass,
  buildPixCode,
  buildBoletoCode
} = require("../../lib/access");
const { ensureTermsAccepted } = require("../../services/termsService");

const crypto = require("crypto");

const router = express.Router();
const PAYMENT_METHODS = ["pix", "boleto", "credit_card", "debit_card"];
const CARD_METHODS = ["credit_card", "debit_card"];
const MAX_INSTALLMENTS = 3;
const PIX_TTL_MINUTES = 30;
const BOLETO_TTL_DAYS = 3;
// Cartao de teste: este numero sempre e recusado (para demonstrar o pagamento recusado).
const DECLINED_TEST_CARD = "4000000000000002";

function luhnValid(number) {
  let sum = 0;
  let double = false;
  for (let i = number.length - 1; i >= 0; i -= 1) {
    let digit = Number(number[i]);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

function detectBrand(number) {
  if (/^4/.test(number)) return "Visa";
  if (/^(5[1-5]|2[2-7])/.test(number)) return "Mastercard";
  if (/^3[47]/.test(number)) return "Amex";
  if (/^(4011|4312|4389|4514|4576|5041|5066|5067|509|6277|6362|6363|650|6516|6550)/.test(number)) return "Elo";
  if (/^(606282|3841)/.test(number)) return "Hipercard";
  return "Cartao";
}

// Valida o cartao (simulado). O numero completo e o CVV nunca sao guardados.
function validateCard(card) {
  const number = String(card && card.number || "").replace(/\D/g, "");
  const holder = String(card && card.holder || "").trim();
  const expiry = String(card && card.expiry || "").replace(/\D/g, "");
  const cvv = String(card && card.cvv || "").replace(/\D/g, "");

  if (number.length < 13 || number.length > 19 || !luhnValid(number)) {
    throw new ApiError(422, "Numero do cartao invalido");
  }
  if (holder.length < 3) throw new ApiError(422, "Informe o nome impresso no cartao");
  if (expiry.length !== 4) throw new ApiError(422, "Validade invalida. Use MM/AA");
  const month = Number(expiry.slice(0, 2));
  const year = 2000 + Number(expiry.slice(2));
  const now = new Date();
  if (month < 1 || month > 12 || year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1)) {
    throw new ApiError(422, "Cartao vencido ou validade invalida");
  }
  if (cvv.length < 3 || cvv.length > 4) throw new ApiError(422, "CVV invalido");
  if (number === DECLINED_TEST_CARD) {
    throw new ApiError(402, "Pagamento recusado pelo emissor do cartao (simulacao). Tente outro cartao.");
  }
  return { brand: detectBrand(number), last4: number.slice(-4) };
}

function makeReceiptCode(paymentId) {
  const now = new Date();
  const day = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  return `FP-${day}-${String(paymentId).padStart(6, "0")}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
}

function parseFeatures(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function serializePlan(plan) {
  return {
    id: plan.id,
    code: plan.code,
    name: plan.name,
    description: plan.description,
    priceCents: plan.price_cents,
    price: Number(plan.price_cents / 100).toFixed(2),
    sessionLimit: plan.session_limit,
    durationDays: plan.duration_days,
    features: parseFeatures(plan.features_json)
  };
}

async function findPlan(planId) {
  const rows = await db.query(
    `SELECT id, code, name, description, price_cents, session_limit, duration_days, features_json, is_active
     FROM access_plans
     WHERE id = ? AND is_active = 1
     LIMIT 1`,
    [planId]
  );
  return rows[0] || null;
}

// Multa por trocar de plano: percentual do valor do plano atual (padrao 20%). Configuravel no .env.
const CHANGE_FEE_PERCENT = Number(process.env.PLAN_CHANGE_FEE_PERCENT || 20);

function formatMoney(cents) {
  return (Number(cents) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Plano pago ainda em uso: ativo, dentro da validade e com treinos sobrando.
// Plano gratuito (teste), vencido ou com todos os treinos usados nao entra aqui.
async function findPaidPlanInUse(userId) {
  const rows = await db.query(
    `SELECT sap.id, sap.plan_id, ap.name AS plan_name, ap.price_cents
     FROM student_access_passes sap
     INNER JOIN access_plans ap ON ap.id = sap.plan_id
     WHERE sap.student_id = ?
       AND sap.source = 'payment'
       AND sap.status = 'active'
       AND sap.expires_at > NOW()
       AND (sap.sessions_total IS NULL OR sap.sessions_used < sap.sessions_total)
     ORDER BY sap.expires_at DESC, sap.id DESC
     LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

function changeFeeCents(current, targetPlanId) {
  if (!current || Number(current.plan_id) === Number(targetPlanId)) return 0;
  return Math.round(Number(current.price_cents) * CHANGE_FEE_PERCENT / 100);
}

router.get(
  "/plans",
  auth(["student"]),
  asyncHandler(async (req, res) => {
    const rows = await db.query(
      `SELECT id, code, name, description, price_cents, session_limit, duration_days, features_json
       FROM access_plans
       WHERE is_active = 1 AND code <> 'trial_1_day'
       ORDER BY price_cents`
    );

    return success(res, rows.map(serializePlan), "Planos carregados com sucesso");
  })
);

router.get(
  "/access/me",
  auth(["student"]),
  asyncHandler(async (req, res) => {
    const activePass = await getActiveAccessPass(req.user.sub, 1);
    const paidInUse = await findPaidPlanInUse(req.user.sub);
    const payments = await db.query(
      `SELECT ps.id, ps.method, ps.amount_cents, ps.penalty_cents, ps.status, ps.pix_code, ps.boleto_code, ps.paid_at, ps.created_at,
              ap.name AS plan_name, ap.code AS plan_code
       FROM payment_simulations ps
       INNER JOIN access_plans ap ON ap.id = ps.plan_id
       WHERE ps.student_id = ?
       ORDER BY ps.created_at DESC
       LIMIT 5`,
      [req.user.sub]
    );

    return success(res, {
      hasActiveAccess: Boolean(activePass),
      access: activePass,
      planChange: {
        feePercent: CHANGE_FEE_PERCENT,
        hasPaidPlanInUse: Boolean(paidInUse),
        currentPlanId: paidInUse ? paidInUse.plan_id : null,
        currentPlanName: paidInUse ? paidInUse.plan_name : null,
        feeCents: paidInUse ? Math.round(Number(paidInUse.price_cents) * CHANGE_FEE_PERCENT / 100) : 0
      },
      payments
    }, "Acesso do aluno carregado com sucesso");
  })
);

router.post(
  "/access/cancel",
  auth(["student"]),
  [body("accessPassId").optional().isInt({ min: 1 }).withMessage("Plano invalido")],
  validateRequest,
  asyncHandler(async (req, res) => {
    const params = [req.user.sub];
    const idFilter = req.body.accessPassId ? "AND sap.id = ?" : "";
    if (req.body.accessPassId) params.push(req.body.accessPassId);

    const rows = await db.query(
      `SELECT sap.id, ap.name AS plan_name
       FROM student_access_passes sap
       INNER JOIN access_plans ap ON ap.id = sap.plan_id
       WHERE sap.student_id = ?
         AND sap.status = 'active'
         AND sap.expires_at > NOW()
         ${idFilter}
       ORDER BY sap.expires_at DESC, sap.id DESC
       LIMIT 1`,
      params
    );

    const pass = rows[0];
    if (!pass) {
      throw new ApiError(404, "Nenhum plano ativo encontrado para cancelar");
    }

    await db.query("UPDATE student_access_passes SET status = 'cancelled' WHERE id = ?", [pass.id]);
    await auditLog(req.user.sub, "access.cancel", "student_access_passes", pass.id);

    return success(res, { accessPassId: pass.id }, `Plano ${pass.plan_name} cancelado com sucesso`);
  })
);

router.post(
  "/payments/simulate",
  auth(["student"]),
  [
    body("planId").isInt({ min: 1 }).withMessage("Plano invalido"),
    body("method").isIn(PAYMENT_METHODS).withMessage("Metodo de pagamento invalido"),
    body("acceptPenalty").optional().isBoolean().withMessage("Confirmacao de multa invalida"),
    body("installments").optional().isInt({ min: 1, max: MAX_INSTALLMENTS }).withMessage("Parcelamento invalido")
  ],
  validateRequest,
  asyncHandler(async (req, res) => {
    const plan = await findPlan(req.body.planId);
    if (!plan || plan.code === "trial_1_day") {
      throw new ApiError(404, "Plano nao encontrado");
    }

    // Trocar um plano pago que ainda esta em uso gera multa; o aluno precisa confirmar.
    const currentPlan = await findPaidPlanInUse(req.user.sub);
    const penaltyCents = changeFeeCents(currentPlan, plan.id);
    if (penaltyCents > 0 && req.body.acceptPenalty !== true && req.body.acceptPenalty !== "true") {
      throw new ApiError(
        409,
        `Trocar de plano gera multa de ${formatMoney(penaltyCents)} (${CHANGE_FEE_PERCENT}% do plano atual ${currentPlan.plan_name}). Confirme para continuar.`
      );
    }
    const totalCents = plan.price_cents + penaltyCents;

    const isCard = CARD_METHODS.includes(req.body.method);
    const card = isCard ? validateCard(req.body.card) : null;
    const installments = req.body.method === "credit_card" ? Number(req.body.installments || 1) : 1;
    const expiresAt = req.body.method === "pix"
      ? new Date(Date.now() + PIX_TTL_MINUTES * 60 * 1000)
      : req.body.method === "boleto"
        ? new Date(Date.now() + BOLETO_TTL_DAYS * 24 * 60 * 60 * 1000)
        : null;

    const connection = await db.pool.getConnection();

    try {
      await connection.beginTransaction();
      const termsAcceptance = await ensureTermsAccepted({
        userId: req.user.sub,
        accepted: req.body.termsAccepted,
        version: req.body.termsVersion,
        origin: "contratacao_plano",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"]
      }, connection);

      const [insertPayment] = await connection.execute(
        `INSERT INTO payment_simulations
           (student_id, plan_id, method, amount_cents, penalty_cents, installments, card_brand, card_last4, expires_at, terms_acceptance_id, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [req.user.sub, plan.id, req.body.method, totalCents, penaltyCents, installments,
          card ? card.brand : null, card ? card.last4 : null, expiresAt, termsAcceptance.id]
      );

      const paymentId = insertPayment.insertId;
      const pixCode = req.body.method === "pix"
        ? buildPixCode({ paymentId, amountCents: totalCents })
        : null;
      const boletoCode = req.body.method === "boleto" ? buildBoletoCode(paymentId) : null;
      const referenceCode = ["credit_card", "debit_card", "transfer"].includes(req.body.method)
        ? `FP-${req.body.method.toUpperCase().replace("_", "-")}-${String(paymentId).padStart(8, "0")}`
        : null;

      await connection.execute(
        "UPDATE payment_simulations SET pix_code = ?, boleto_code = ? WHERE id = ?",
        [pixCode, boletoCode, paymentId]
      );

      await auditLog(req.user.sub, "payments.simulate", "payment_simulations", paymentId, {
        planId: plan.id,
        method: req.body.method,
        penaltyCents,
        termsAcceptanceId: termsAcceptance.id,
        prototype: true
      }, connection);

      await connection.commit();

      return created(res, {
        id: paymentId,
        plan: serializePlan(plan),
        method: req.body.method,
        amountCents: totalCents,
        basePriceCents: plan.price_cents,
        penaltyCents,
        installments,
        installmentCents: Math.ceil(totalCents / installments),
        cardBrand: card ? card.brand : null,
        cardLast4: card ? card.last4 : null,
        expiresAt,
        status: "pending",
        pixCode,
        boletoCode,
        referenceCode,
        prototypeNotice: "Pagamento ficticio para demonstracao academica. Nenhuma cobranca real foi gerada."
      }, "Cobranca gerada com sucesso");
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  })
);

router.post(
  "/payments/:id/confirm",
  auth(["student"]),
  asyncHandler(async (req, res) => {
    const connection = await db.pool.getConnection();

    try {
      await connection.beginTransaction();
      const [paymentRows] = await connection.execute(
        `SELECT ps.id, ps.student_id, ps.plan_id, ps.status, ps.terms_acceptance_id, ps.penalty_cents, ps.expires_at,
                ap.code, ap.name, ap.price_cents, ap.session_limit, ap.duration_days
         FROM payment_simulations ps
         INNER JOIN access_plans ap ON ap.id = ps.plan_id
         WHERE ps.id = ? AND ps.student_id = ?
         LIMIT 1`,
        [req.params.id, req.user.sub]
      );

      const payment = paymentRows[0];
      if (!payment) {
        throw new ApiError(404, "Cobranca nao encontrada");
      }

      if (payment.status === "paid") {
        throw new ApiError(409, "Cobranca ja confirmada");
      }

      if (payment.status !== "pending") {
        throw new ApiError(409, "Cobranca nao esta pendente");
      }

      if (payment.expires_at && new Date(payment.expires_at) < new Date()) {
        await connection.execute("UPDATE payment_simulations SET status = 'cancelled' WHERE id = ?", [payment.id]);
        await connection.commit();
        throw new ApiError(410, "Cobranca expirada. Gere uma nova para continuar.");
      }

      if (!payment.terms_acceptance_id) {
        throw new ApiError(422, "Termos de Uso nao foram aceitos para esta contratacao");
      }

      const [passResult] = await connection.execute(
        `INSERT INTO student_access_passes
           (student_id, plan_id, source, status, starts_at, expires_at, sessions_total, sessions_used)
         VALUES (?, ?, 'payment', 'active', NOW(), DATE_ADD(NOW(), INTERVAL ? DAY), ?, 0)`,
        [req.user.sub, payment.plan_id, payment.duration_days, payment.session_limit]
      );

      // Troca com multa: o plano pago anterior deixa de valer.
      if (Number(payment.penalty_cents) > 0) {
        await connection.execute(
          `UPDATE student_access_passes
           SET status = 'cancelled'
           WHERE student_id = ? AND source = 'payment' AND status = 'active' AND id <> ?`,
          [req.user.sub, passResult.insertId]
        );
      }

      await connection.execute(
        `UPDATE payment_simulations
         SET status = 'paid', paid_at = NOW(), access_pass_id = ?, receipt_code = ?
         WHERE id = ?`,
        [passResult.insertId, makeReceiptCode(payment.id), payment.id]
      );

      await auditLog(req.user.sub, "payments.confirm", "payment_simulations", payment.id, {
        accessPassId: passResult.insertId,
        penaltyCents: Number(payment.penalty_cents) || 0,
        prototype: true
      }, connection);

      await connection.commit();

      return success(res, {
        paymentId: payment.id,
        accessPassId: passResult.insertId,
        prototypeNotice: "Pagamento confirmado de forma ficticia para demonstracao."
      }, "Pagamento confirmado e plano ativado");
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  })
);

// Meus pagamentos (Financeiro do aluno).
router.get(
  "/payments/mine",
  auth(["student"]),
  asyncHandler(async (req, res) => {
    const rows = await db.query(
      `SELECT ps.id, ps.method, ps.amount_cents, ps.penalty_cents, ps.installments, ps.card_brand, ps.card_last4,
              ps.status, ps.receipt_code, ps.paid_at, ps.created_at, ps.expires_at, ap.name AS plan_name
       FROM payment_simulations ps
       INNER JOIN access_plans ap ON ap.id = ps.plan_id
       WHERE ps.student_id = ?
       ORDER BY ps.id DESC
       LIMIT 100`,
      [req.user.sub]
    );
    const paid = rows.filter((row) => row.status === "paid");
    return success(res, {
      payments: rows,
      totals: {
        paidCents: paid.reduce((sum, row) => sum + Number(row.amount_cents), 0),
        paidCount: paid.length,
        penaltyCents: paid.reduce((sum, row) => sum + Number(row.penalty_cents || 0), 0)
      }
    }, "Pagamentos carregados com sucesso");
  })
);

// Comprovante de um pagamento pago.
router.get(
  "/payments/:id/receipt",
  auth(["student"]),
  asyncHandler(async (req, res) => {
    const rows = await db.query(
      `SELECT ps.id, ps.method, ps.amount_cents, ps.penalty_cents, ps.installments, ps.card_brand, ps.card_last4,
              ps.status, ps.receipt_code, ps.paid_at, ps.created_at,
              ap.name AS plan_name, ap.session_limit, ap.duration_days,
              u.name AS student_name, u.email AS student_email, u.document AS student_document
       FROM payment_simulations ps
       INNER JOIN access_plans ap ON ap.id = ps.plan_id
       INNER JOIN users u ON u.id = ps.student_id
       WHERE ps.id = ? AND ps.student_id = ?
       LIMIT 1`,
      [req.params.id, req.user.sub]
    );
    const receipt = rows[0];
    if (!receipt) throw new ApiError(404, "Pagamento nao encontrado");
    if (receipt.status !== "paid") throw new ApiError(409, "O comprovante so existe para pagamentos confirmados");
    const document = String(receipt.student_document || "");
    receipt.student_document = document.length >= 11 ? `***.${document.slice(3, 6)}.${document.slice(6, 9)}-**` : "";
    return success(res, receipt, "Comprovante carregado com sucesso");
  })
);

// Cancelar uma cobranca que ainda nao foi paga.
router.post(
  "/payments/:id/cancel",
  auth(["student"]),
  asyncHandler(async (req, res) => {
    const result = await db.query(
      "UPDATE payment_simulations SET status = 'cancelled' WHERE id = ? AND student_id = ? AND status = 'pending'",
      [req.params.id, req.user.sub]
    );
    if (!result.affectedRows) throw new ApiError(404, "Nenhuma cobranca pendente encontrada");
    return success(res, { id: Number(req.params.id) }, "Cobranca cancelada");
  })
);

module.exports = router;
