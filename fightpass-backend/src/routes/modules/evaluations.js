const express = require("express");
const { body } = require("express-validator");
const db = require("../../database/connection");
const { asyncHandler, success, created, validateRequest, auth, ApiError } = require("../../lib/http");
const {
  auditLog,
  ensureInstitutionAccess,
  ensureStudentInInstitution,
  ensureInstitutionModality,
  findSharedInstitution
} = require("../../lib/business");

const router = express.Router();

router.get(
  "/students/:id/evaluations",
  auth(["institution_admin", "instructor"]),
  asyncHandler(async (req, res) => {
    const institutionId = await findSharedInstitution(req.params.id, req.user.sub);
    const data = await db.query(
      `SELECT e.id, e.score, e.comment, e.created_at,
              u.name AS evaluator_name, m.name AS modality_name
       FROM student_evaluations e
       INNER JOIN users u ON u.id = e.evaluator_user_id
       INNER JOIN modalities m ON m.id = e.modality_id
       WHERE e.student_user_id = ? AND e.institution_id = ?
       ORDER BY e.created_at DESC`,
      [req.params.id, institutionId]
    );

    return success(res, data, "Avaliacoes carregadas com sucesso");
  })
);

router.post(
  "/students/:id/evaluations",
  auth(["institution_admin", "instructor"]),
  [
    body("institutionId").isInt({ min: 1 }).withMessage("Instituicao invalida"),
    body("modalityId").isInt({ min: 1 }).withMessage("Modalidade invalida"),
    body("score").isFloat({ min: 0, max: 10 }).withMessage("Nota invalida"),
    body("comment").optional().trim().isLength({ max: 1000 }).withMessage("Comentario muito longo")
  ],
  validateRequest,
  asyncHandler(async (req, res) => {
    const studentRows = await db.query("SELECT id, name, email FROM users WHERE id = ? LIMIT 1", [req.params.id]);
    if (!studentRows[0]) {
      throw new ApiError(404, "Aluno nao encontrado");
    }

    await ensureInstitutionAccess(req.user.sub, req.body.institutionId);
    await ensureStudentInInstitution(req.params.id, req.body.institutionId);
    await ensureInstitutionModality(req.body.institutionId, req.body.modalityId);

    const result = await db.query(
      `INSERT INTO student_evaluations (institution_id, evaluator_user_id, student_user_id, modality_id, score, comment)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.body.institutionId, req.user.sub, req.params.id, req.body.modalityId, req.body.score, req.body.comment || null]
    );

    await auditLog(req.user.sub, "evaluations.create", "student_evaluations", result.insertId, {
      studentId: Number(req.params.id),
      institutionId: req.body.institutionId,
      score: req.body.score
    });

    return created(res, { id: result.insertId }, "Avaliacao registrada com sucesso");
  })
);

router.get(
  "/students/:id/profile",
  auth(["institution_admin", "instructor"]),
  asyncHandler(async (req, res) => {
    const institutionId = await findSharedInstitution(req.params.id, req.user.sub);
    const rows = await db.query(
      `SELECT u.id, u.name, u.email,
              m.name AS modality_name,
              COALESCE(ROUND(AVG(e.score), 2), 0) AS average_score,
              COALESCE(ROUND(AVG(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END) * 100, 2), 0) AS attendance_rate
       FROM users u
       INNER JOIN enrollments en ON en.student_id = u.id AND en.institution_id = ? AND en.status IN ('active', 'trial')
       INNER JOIN modalities m ON m.id = en.modality_id
       LEFT JOIN student_evaluations e ON e.student_user_id = u.id
       LEFT JOIN attendances a ON a.student_id = u.id
       WHERE u.id = ?
       GROUP BY u.id, u.name, u.email, m.name`,
      [institutionId, req.params.id]
    );

    const profile = rows[0];
    if (!profile) {
      throw new ApiError(404, "Aluno nao encontrado");
    }

    return success(res, profile, "Perfil do aluno carregado com sucesso");
  })
);

router.get(
  "/students/:id/progress",
  auth(["institution_admin", "instructor"]),
  asyncHandler(async (req, res) => {
    const institutionId = await findSharedInstitution(req.params.id, req.user.sub);
    const data = await db.query(
      `SELECT reference_month, average_score, attendance_rate, risk_level
       FROM student_progress_snapshots
       WHERE student_user_id = ? AND institution_id = ?
       ORDER BY reference_month`,
      [req.params.id, institutionId]
    );

    return success(res, data, "Evolucao do aluno carregada com sucesso");
  })
);

module.exports = router;
