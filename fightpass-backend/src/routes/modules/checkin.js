const crypto = require("crypto");
const express = require("express");
const { body } = require("express-validator");
const db = require("../../database/connection");
const env = require("../../config/env");
const { asyncHandler, success, created, validateRequest, auth, ApiError } = require("../../lib/http");
const { auditLog } = require("../../lib/business");

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
