const crypto = require("crypto");
const express = require("express");
const { body, query } = require("express-validator");
const db = require("../../database/connection");
const env = require("../../config/env");
const { asyncHandler, success, created, validateRequest, auth, ApiError } = require("../../lib/http");
const { auditLog, ensureInstitutionAccess } = require("../../lib/business");

const router = express.Router();

router.post(
  "/token",
  auth(["student"]),
  [body("bookingId").optional().isInt({ min: 1 }).withMessage("Agendamento invalido")],
  validateRequest,
  asyncHandler(async (req, res) => {
    const params = [req.user.sub];
    const bookingFilter = req.body.bookingId ? "AND b.id = ?" : "";
    if (req.body.bookingId) {
      params.push(req.body.bookingId);
    }

    const rows = await db.query(
      `SELECT b.id, b.booking_date, b.status,
              cs.start_time, c.title AS class_title, i.name AS institution_name
       FROM bookings b
       INNER JOIN class_schedules cs ON cs.id = b.class_schedule_id
       INNER JOIN classes c ON c.id = cs.class_id
       INNER JOIN institutions i ON i.id = c.institution_id
       LEFT JOIN attendances a ON a.booking_id = b.id
       WHERE b.student_id = ?
         AND b.status IN ('scheduled', 'confirmed')
         AND b.booking_date >= CURDATE()
         AND a.id IS NULL
         ${bookingFilter}
       ORDER BY b.booking_date ASC, cs.start_time ASC
       LIMIT 1`,
      params
    );

    const booking = rows[0];
    if (!booking) {
      throw new ApiError(404, "Nao existe agendamento valido para gerar check-in");
    }

    const token = crypto.randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + env.checkinTokenTtlSeconds * 1000);

    await db.query(
      `UPDATE attendance_qr_tokens
       SET status = 'expired'
       WHERE booking_id = ? AND student_id = ? AND status = 'active'`,
      [booking.id, req.user.sub]
    );

    await db.query(
      `INSERT INTO attendance_qr_tokens (student_id, booking_id, token, expires_at, status)
       VALUES (?, ?, ?, ?, 'active')`,
      [req.user.sub, booking.id, token, expiresAt]
    );

    await auditLog(req.user.sub, "checkin.token_create", "attendance_qr_tokens", booking.id);

    return created(res, {
      token,
      bookingId: booking.id,
      expiresAt,
      ttlSeconds: env.checkinTokenTtlSeconds,
      booking
    }, "Token de check-in criado com sucesso");
  })
);

router.post(
  "/confirm",
  [body("token").notEmpty().withMessage("Token obrigatorio")],
  validateRequest,
  asyncHandler(async (req, res) => {
    const rows = await db.query(
      `SELECT id, student_id, booking_id, expires_at, status
       FROM attendance_qr_tokens
       WHERE token = ? LIMIT 1`,
      [req.body.token]
    );

    const tokenData = rows[0];
    if (!tokenData || tokenData.status !== "active") {
      throw new ApiError(400, "Token de check-in invalido");
    }

    if (new Date(tokenData.expires_at) < new Date()) {
      await db.query("UPDATE attendance_qr_tokens SET status = 'expired' WHERE id = ?", [tokenData.id]);
      throw new ApiError(400, "Token de check-in expirado");
    }

    const existingAttendance = await db.query(
      "SELECT id FROM attendances WHERE booking_id = ? AND student_id = ? LIMIT 1",
      [tokenData.booking_id, tokenData.student_id]
    );

    if (existingAttendance[0]) {
      await db.query("UPDATE attendance_qr_tokens SET status = 'used' WHERE id = ?", [tokenData.id]);
      throw new ApiError(409, "Presenca ja registrada para este agendamento");
    }

    const connection = await db.pool.getConnection();

    try {
      await connection.beginTransaction();
      const [attendanceResult] = await connection.execute(
        `INSERT INTO attendances (booking_id, student_id, checked_in_at, status)
         VALUES (?, ?, NOW(), 'present')`,
        [tokenData.booking_id, tokenData.student_id]
      );

      await connection.execute("UPDATE attendance_qr_tokens SET status = 'used' WHERE id = ?", [tokenData.id]);
      await connection.execute("UPDATE bookings SET status = 'confirmed' WHERE id = ?", [tokenData.booking_id]);
      await auditLog(tokenData.student_id, "checkin.confirm", "attendances", attendanceResult.insertId, {
        bookingId: tokenData.booking_id
      }, connection);

      await connection.commit();

      return success(res, { attendanceId: attendanceResult.insertId }, "Check-in confirmado com sucesso");
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  })
);

router.get(
  "/roster",
  auth(["institution_admin", "instructor"]),
  [
    query("institutionId").isInt({ min: 1 }).withMessage("Instituicao invalida"),
    query("date").optional().isISO8601().withMessage("Data invalida")
  ],
  validateRequest,
  asyncHandler(async (req, res) => {
    await ensureInstitutionAccess(req.user.sub, req.query.institutionId);
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const data = await db.query(
      `SELECT b.id AS booking_id, b.booking_date, b.status AS booking_status,
              u.id AS student_id, u.name AS student_name, u.avatar_url,
              c.title AS class_title, m.name AS modality_name,
              cs.day_of_week, cs.start_time, cs.end_time, cs.room_name,
              a.id AS attendance_id, a.status AS attendance_status, a.checked_in_at
       FROM bookings b
       INNER JOIN users u ON u.id = b.student_id
       INNER JOIN class_schedules cs ON cs.id = b.class_schedule_id
       INNER JOIN classes c ON c.id = cs.class_id
       INNER JOIN modalities m ON m.id = c.modality_id
       LEFT JOIN attendances a ON a.booking_id = b.id AND a.student_id = b.student_id
       WHERE c.institution_id = ?
         AND b.booking_date = ?
         AND b.status <> 'cancelled'
       ORDER BY cs.start_time, c.title, u.name`,
      [req.query.institutionId, date]
    );

    return success(res, { date, items: data }, "Chamada carregada com sucesso");
  })
);

router.post(
  "/manual",
  auth(["institution_admin", "instructor"]),
  [
    body("bookingId").isInt({ min: 1 }).withMessage("Agendamento invalido"),
    body("status").isIn(["present", "absent"]).withMessage("Status de presenca invalido")
  ],
  validateRequest,
  asyncHandler(async (req, res) => {
    const rows = await db.query(
      `SELECT b.id, b.student_id, c.institution_id
       FROM bookings b
       INNER JOIN class_schedules cs ON cs.id = b.class_schedule_id
       INNER JOIN classes c ON c.id = cs.class_id
       WHERE b.id = ? AND b.status <> 'cancelled'
       LIMIT 1`,
      [req.body.bookingId]
    );
    const booking = rows[0];
    if (!booking) {
      throw new ApiError(404, "Agendamento nao encontrado para chamada");
    }

    await ensureInstitutionAccess(req.user.sub, booking.institution_id);
    const connection = await db.pool.getConnection();

    try {
      await connection.beginTransaction();
      const [existing] = await connection.execute(
        "SELECT id FROM attendances WHERE booking_id = ? AND student_id = ? LIMIT 1",
        [booking.id, booking.student_id]
      );

      let attendanceId = existing[0] ? existing[0].id : null;
      if (attendanceId) {
        await connection.execute(
          "UPDATE attendances SET status = ?, checked_in_at = NOW() WHERE id = ?",
          [req.body.status, attendanceId]
        );
      } else {
        const [insert] = await connection.execute(
          `INSERT INTO attendances (booking_id, student_id, checked_in_at, status)
           VALUES (?, ?, NOW(), ?)`,
          [booking.id, booking.student_id, req.body.status]
        );
        attendanceId = insert.insertId;
      }

      if (req.body.status === "present") {
        await connection.execute("UPDATE bookings SET status = 'confirmed' WHERE id = ?", [booking.id]);
      }

      await auditLog(req.user.sub, "checkin.manual_attendance", "attendances", attendanceId, {
        bookingId: booking.id,
        status: req.body.status,
        institutionId: booking.institution_id
      }, connection);

      await connection.commit();
      return success(res, { attendanceId, status: req.body.status }, "Chamada atualizada com sucesso");
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  })
);

router.get(
  "/history",
  auth(["student"]),
  asyncHandler(async (req, res) => {
    const data = await db.query(
      `SELECT id, booking_id, checked_in_at, status
       FROM attendances
       WHERE student_id = ?
       ORDER BY checked_in_at DESC`,
      [req.user.sub]
    );

    return success(res, data, "Historico de presencas carregado com sucesso");
  })
);

module.exports = router;
