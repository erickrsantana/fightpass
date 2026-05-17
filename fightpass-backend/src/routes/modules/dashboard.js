const express = require("express");
const db = require("../../database/connection");
const { asyncHandler, success, auth } = require("../../lib/http");
const { ensureInstitutionAccess } = require("../../lib/business");

const router = express.Router();

router.get(
  "/student",
  auth(["student"]),
  asyncHandler(async (req, res) => {
    const rows = await db.query(
      `SELECT
          (SELECT COUNT(*) FROM bookings WHERE student_id = ? AND status IN ('scheduled', 'confirmed')) AS weekly_classes,
          COALESCE((SELECT ROUND(AVG(CASE WHEN status = 'present' THEN 1 ELSE 0 END) * 100, 2) FROM attendances WHERE student_id = ?), 0) AS attendance_rate,
          COALESCE((SELECT ROUND(AVG(score), 1) FROM student_evaluations WHERE student_user_id = ?), 0) AS average_score`,
      [req.user.sub, req.user.sub, req.user.sub]
    );

    return success(res, rows[0], "Dashboard do aluno carregado com sucesso");
  })
);

router.get(
  "/institution/:id",
  auth(["institution_admin", "instructor"]),
  asyncHandler(async (req, res) => {
    await ensureInstitutionAccess(req.user.sub, req.params.id);
    const rows = await db.query(
      `SELECT
          (SELECT COUNT(*) FROM enrollments WHERE institution_id = ? AND status = 'active') AS active_students,
          COALESCE((
            SELECT ROUND(AVG(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END) * 100, 2)
            FROM attendances a
            INNER JOIN bookings b ON b.id = a.booking_id
            INNER JOIN class_schedules cs ON cs.id = b.class_schedule_id
            INNER JOIN classes c ON c.id = cs.class_id
            WHERE c.institution_id = ?
          ), 0) AS attendance_rate,
          COALESCE((
            SELECT ROUND(
              SUM(CASE WHEN risk_level = 'high' THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) * 100,
              2
            )
            FROM student_progress_snapshots
            WHERE institution_id = ?
          ), 0) AS dropout_risk_rate`,
      [req.params.id, req.params.id, req.params.id]
    );

    return success(res, rows[0], "Dashboard institucional carregado com sucesso");
  })
);

module.exports = router;
