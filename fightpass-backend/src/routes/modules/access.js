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

const router = express.Router();
const PAYMENT_METHODS = ["pix", "boleto", "credit_card", "debit_card", "transfer"];

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
    body("acceptPenalty").optional().isBoolean().withMessage("Confirmacao de multa invalida")
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
        `INSERT INTO payment_simulations (student_id, plan_id, method, amount_cents, penalty_cents, terms_acceptance_id, status)
         VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
        [req.user.sub, plan.id, req.body.method, totalCents, penaltyCents, termsAcceptance.id]
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
        `SELECT ps.id, ps.student_id, ps.plan_id, ps.status, ps.terms_acceptance_id, ps.penalty_cents,
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
         SET status = 'paid', paid_at = NOW(), access_pass_id = ?
         WHERE id = ?`,
        [passResult.insertId, payment.id]
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

module.exports = router;