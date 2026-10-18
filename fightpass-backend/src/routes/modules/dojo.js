const express = require("express");
const { body, param, query } = require("express-validator");
const db = require("../../database/connection");
const { asyncHandler, success, created, validateRequest, auth, ApiError, hashPassword } = require("../../lib/http");
const { ensureInstitutionAccess, auditLog } = require("../../lib/business");
const { onlyDigits, isValidCpf } = require("../../lib/access");
const {
  getDojoPlan,
  getInstitutionSubscription,
  createDojoPaymentSimulation,
  confirmDojoPayment
} = require("../../services/dojoSubscriptionService");

const router = express.Router();
const PAYMENT_METHODS = ["pix", "boleto", "credit_card", "debit_card"];

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
    // Instrutor so enxerga as turmas em que ele e o professor responsavel.
    const onlyMine = req.user.role === "instructor";
    const data = await db.query(
      `SELECT c.id, c.institution_id, c.modality_id, c.instructor_id, c.title, c.description, c.capacity, c.status,
              m.name AS modality_name, iu.name AS instructor_name
       FROM classes c
       INNER JOIN modalities m ON m.id = c.modality_id
       LEFT JOIN users iu ON iu.id = c.instructor_id
       WHERE c.institution_id = ?
       ${onlyMine ? "AND c.instructor_id = ?" : ""}
       ORDER BY c.status, c.title`,
      onlyMine ? [req.query.institutionId, req.user.sub] : [req.query.institutionId]
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
    body("method").isIn(PAYMENT_METHODS).withMessage("Forma de pagamento invalida")
  ],
  validateRequest,
  asyncHandler(async (req, res) => {
    await ensureInstitutionAccess(req.user.sub, req.body.institutionId, ["institution_admin"]);
    const payment = await createDojoPaymentSimulation({
      institutionId: req.body.institutionId,
      method: req.body.method,
      userId: req.user.sub,
      termsAccepted: req.body.termsAccepted,
      termsVersion: req.body.termsVersion,
      card: req.body.card,
      installments: req.body.installments,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"]
    });
    return success(res, payment, "Cobranca DOJO ficticia gerada com sucesso", 201);
  })
);

router.get(
  "/payments/mine",
  auth(["institution_admin"]),
  [query("institutionId").isInt({ min: 1 }).withMessage("Instituicao invalida")],
  validateRequest,
  asyncHandler(async (req, res) => {
    await ensureInstitutionAccess(req.user.sub, req.query.institutionId, ["institution_admin"]);
    const rows = await db.query(
      `SELECT dp.id, dp.method, dp.amount_cents, 0 AS penalty_cents, dp.installments, dp.card_brand, dp.card_last4,
              dp.status, dp.receipt_code, dp.paid_at, dp.created_at, dp.expires_at, pp.name AS plan_name
       FROM dojo_payment_simulations dp
       INNER JOIN platform_plans pp ON pp.id = dp.plan_id
       WHERE dp.institution_id = ?
       ORDER BY dp.id DESC LIMIT 100`,
      [req.query.institutionId]
    );
    const paid = rows.filter((row) => row.status === "paid");
    return success(res, {
      payments: rows,
      totals: {
        paidCents: paid.reduce((sum, row) => sum + Number(row.amount_cents), 0),
        paidCount: paid.length,
        penaltyCents: 0
      }
    }, "Pagamentos carregados com sucesso");
  })
);

router.get(
  "/payments/:id/receipt",
  auth(["institution_admin"]),
  [param("id").isInt({ min: 1 }).withMessage("Pagamento invalido")],
  validateRequest,
  asyncHandler(async (req, res) => {
    const rows = await db.query(
      `SELECT dp.id, dp.institution_id, dp.method, dp.amount_cents, 0 AS penalty_cents, dp.installments, dp.card_brand,
              dp.card_last4, dp.status, dp.receipt_code, dp.paid_at, dp.created_at,
              pp.name AS plan_name, NULL AS session_limit, pp.duration_days,
              i.name AS student_name, i.legal_document AS student_document
       FROM dojo_payment_simulations dp
       INNER JOIN platform_plans pp ON pp.id = dp.plan_id
       INNER JOIN institutions i ON i.id = dp.institution_id
       WHERE dp.id = ? LIMIT 1`,
      [req.params.id]
    );
    const receipt = rows[0];
    if (!receipt) throw new ApiError(404, "Pagamento nao encontrado");
    await ensureInstitutionAccess(req.user.sub, receipt.institution_id, ["institution_admin"]);
    if (receipt.status !== "paid") throw new ApiError(409, "O comprovante so existe para pagamentos confirmados");
    receipt.student_document = "";
    return success(res, receipt, "Comprovante carregado com sucesso");
  })
);

router.post(
  "/payments/:id/cancel",
  auth(["institution_admin"]),
  [param("id").isInt({ min: 1 }).withMessage("Pagamento invalido")],
  validateRequest,
  asyncHandler(async (req, res) => {
    const rows = await db.query("SELECT institution_id, status FROM dojo_payment_simulations WHERE id = ? LIMIT 1", [req.params.id]);
    if (!rows[0]) throw new ApiError(404, "Pagamento nao encontrado");
    await ensureInstitutionAccess(req.user.sub, rows[0].institution_id, ["institution_admin"]);
    if (rows[0].status !== "pending") throw new ApiError(409, "Somente cobrancas pendentes podem ser canceladas");
    await db.query("UPDATE dojo_payment_simulations SET status = 'cancelled' WHERE id = ?", [req.params.id]);
    return success(res, { id: Number(req.params.id) }, "Cobranca cancelada");
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

// ---------------------------------------------------------------------------
// Instrutores: somente a academia cria o acesso do professor
// ---------------------------------------------------------------------------
router.get(
  "/instructors",
  auth(["institution_admin"]),
  [query("institutionId").isInt({ min: 1 }).withMessage("Instituicao invalida")],
  validateRequest,
  asyncHandler(async (req, res) => {
    await ensureInstitutionAccess(req.user.sub, req.query.institutionId, ["institution_admin"]);
    const rows = await db.query(
      `SELECT u.id, u.name, u.email, u.phone, u.avatar_url IS NOT NULL AND u.avatar_url <> '' AS has_avatar,
              iu.status,
              (SELECT COUNT(*) FROM classes c WHERE c.instructor_id = u.id AND c.institution_id = iu.institution_id AND c.status = 'active') AS classes_count
       FROM institution_user iu
       INNER JOIN users u ON u.id = iu.user_id
       WHERE iu.institution_id = ? AND iu.membership_role = 'instructor'
       ORDER BY iu.status, u.name`,
      [req.query.institutionId]
    );
    return success(
      res,
      rows.map((row) => ({ ...row, has_avatar: Boolean(row.has_avatar), classes_count: Number(row.classes_count) })),
      "Instrutores carregados com sucesso"
    );
  })
);

router.post(
  "/instructors",
  auth(["institution_admin"]),
  [
    body("institutionId").isInt({ min: 1 }).withMessage("Instituicao invalida"),
    body("name").trim().isLength({ min: 3, max: 150 }).withMessage("Informe o nome do instrutor"),
    body("email").trim().isEmail().withMessage("E-mail invalido").normalizeEmail(),
    body("document").trim().custom((value) => isValidCpf(value)).withMessage("CPF invalido"),
    body("phone").optional({ checkFalsy: true }).trim().isLength({ min: 10, max: 20 }).withMessage("Telefone invalido"),
    body("password")
      .isLength({ min: 8 }).withMessage("A senha deve ter no minimo 8 caracteres")
      .matches(/[A-Z]/).withMessage("A senha deve conter letra maiuscula")
      .matches(/[a-z]/).withMessage("A senha deve conter letra minuscula")
      .matches(/[0-9]/).withMessage("A senha deve conter numero")
  ],
  validateRequest,
  asyncHandler(async (req, res) => {
    await ensureInstitutionAccess(req.user.sub, req.body.institutionId, ["institution_admin"]);

    const roles = await db.query("SELECT id FROM roles WHERE code = 'instructor' LIMIT 1");
    if (!roles[0]) throw new ApiError(500, "Perfil de instrutor nao configurado");

    const passwordHash = await hashPassword(req.body.password);
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [user] = await connection.execute(
        `INSERT INTO users (role_id, name, email, password_hash, document, phone, is_active)
         VALUES (?, ?, ?, ?, ?, ?, 1)`,
        [roles[0].id, req.body.name, req.body.email, passwordHash, onlyDigits(req.body.document), req.body.phone || null]
      );
      await connection.execute(
        `INSERT INTO institution_user (institution_id, user_id, membership_role, status)
         VALUES (?, ?, 'instructor', 'active')`,
        [req.body.institutionId, user.insertId]
      );
      await auditLog(req.user.sub, "instructors.create", "users", user.insertId, {
        institutionId: req.body.institutionId
      }, connection);
      await connection.commit();
      return created(res, { id: user.insertId, name: req.body.name, email: req.body.email }, "Instrutor criado com sucesso");
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  })
);

router.patch(
  "/instructors/:id/status",
  auth(["institution_admin"]),
  [
    param("id").isInt({ min: 1 }).withMessage("Instrutor invalido"),
    body("institutionId").isInt({ min: 1 }).withMessage("Instituicao invalida"),
    body("status").isIn(["active", "inactive"]).withMessage("Status invalido")
  ],
  validateRequest,
  asyncHandler(async (req, res) => {
    await ensureInstitutionAccess(req.user.sub, req.body.institutionId, ["institution_admin"]);
    const result = await db.query(
      `UPDATE institution_user SET status = ?
       WHERE institution_id = ? AND user_id = ? AND membership_role = 'instructor'`,
      [req.body.status, req.body.institutionId, req.params.id]
    );
    if (!result.affectedRows) throw new ApiError(404, "Instrutor nao encontrado nesta academia");
    await auditLog(req.user.sub, "instructors.status", "users", Number(req.params.id), {
      status: req.body.status,
      institutionId: req.body.institutionId
    });
    return success(res, { id: Number(req.params.id), status: req.body.status }, "Instrutor atualizado com sucesso");
  })
);

module.exports = router;
