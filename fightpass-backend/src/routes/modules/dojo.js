const express = require("express");
const { body, param, query } = require("express-validator");
const db = require("../../database/connection");
const { asyncHandler, success, validateRequest, auth, ApiError } = require("../../lib/http");
const { ensureInstitutionAccess } = require("../../lib/business");
const {
  getDojoPlan,
  getInstitutionSubscription,
  createDojoPaymentSimulation,
  confirmDojoPayment
} = require("../../services/dojoSubscriptionService");

const router = express.Router();

function serializePlan(plan) {
  return {
    id: plan.id,
    code: plan.code,
    name: plan.name,
    description: plan.description,
    priceCents: plan.price_cents,
    durationDays: plan.duration_days,
    audience: "dojo"
  };
}

router.get(
  "/plans",
  auth(["institution_admin"]),
  asyncHandler(async (req, res) => {
    const plan = await getDojoPlan();
    return success(res, [serializePlan(plan)], "Planos DOJO carregados com sucesso");
  })
);

router.get(
  "/subscription",
  auth(["institution_admin", "instructor"]),
  [query("institutionId").isInt({ min: 1 }).withMessage("Instituicao invalida")],
  validateRequest,
  asyncHandler(async (req, res) => {
    await ensureInstitutionAccess(req.user.sub, req.query.institutionId);
    const subscription = await getInstitutionSubscription(req.query.institutionId);
    const plan = await getDojoPlan();
    return success(res, subscription || {
      institution_id: Number(req.query.institutionId),
      status: "not_subscribed",
      plan_id: plan.id,
      plan_code: plan.code,
      plan_name: plan.name,
      plan_description: plan.description,
      price_cents: plan.price_cents,
      duration_days: plan.duration_days
    }, "Assinatura DOJO carregada com sucesso");
  })
);

router.get(
  "/classes",
  auth(["institution_admin", "instructor"]),
  [query("institutionId").isInt({ min: 1 }).withMessage("Instituicao invalida")],
  validateRequest,
  asyncHandler(async (req, res) => {
    await ensureInstitutionAccess(req.user.sub, req.query.institutionId);
    const data = await db.query(
      `SELECT c.id, c.institution_id, c.modality_id, c.title, c.description, c.capacity, c.status,
              m.name AS modality_name
       FROM classes c
       INNER JOIN modalities m ON m.id = c.modality_id
       WHERE c.institution_id = ?
       ORDER BY c.status, c.title`,
      [req.query.institutionId]
    );

    if (data.length) {
      const classIds = data.map((item) => item.id);
      const schedules = await db.query(
        `SELECT id, class_id, day_of_week, start_time, end_time, room_name
         FROM class_schedules
         WHERE class_id IN (${classIds.map(() => "?").join(", ")})
         ORDER BY day_of_week, start_time`,
        classIds
      );
      data.forEach((item) => {
        item.schedules = schedules.filter((schedule) => schedule.class_id === item.id);
      });
    }

    return success(res, data, "Aulas do DOJO carregadas com sucesso");
  })
);

router.post(
  "/payments/simulate",
  auth(["institution_admin"]),
  [
    body("institutionId").isInt({ min: 1 }).withMessage("Instituicao invalida"),
    body("method").isIn(["pix", "boleto"]).withMessage("Forma de pagamento invalida"),
    body("contractAccepted").custom((value) => value === true || value === "true").withMessage("Aceite do contrato obrigatorio")
  ],
  validateRequest,
  asyncHandler(async (req, res) => {
    await ensureInstitutionAccess(req.user.sub, req.body.institutionId, ["institution_admin"]);
    const payment = await createDojoPaymentSimulation({
      institutionId: req.body.institutionId,
      method: req.body.method,
      userId: req.user.sub,
      contractAccepted: req.body.contractAccepted === true || req.body.contractAccepted === "true"
    });
    return success(res, payment, "Cobranca DOJO ficticia gerada com sucesso", 201);
  })
);

router.post(
  "/payments/:id/confirm",
  auth(["institution_admin"]),
  [param("id").isInt({ min: 1 }).withMessage("Pagamento invalido")],
  validateRequest,
  asyncHandler(async (req, res) => {
    const rows = await db.query(
      "SELECT institution_id FROM dojo_payment_simulations WHERE id = ? LIMIT 1",
      [req.params.id]
    );
    const payment = rows[0];
    if (!payment) {
      throw new ApiError(404, "Pagamento DOJO nao encontrado");
    }

    await ensureInstitutionAccess(req.user.sub, payment.institution_id, ["institution_admin"]);
    const subscription = await confirmDojoPayment(req.params.id, req.user.sub);
    return success(res, subscription, "Pagamento DOJO confirmado com sucesso");
  })
);

module.exports = router;
