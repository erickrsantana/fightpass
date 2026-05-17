const express = require("express");
const { body } = require("express-validator");
const db = require("../../database/connection");
const env = require("../../config/env");
const { asyncHandler, success, created, validateRequest, auth, ApiError } = require("../../lib/http");
const { auditLog } = require("../../lib/business");
const {
  ensureStudentAccess,
  reserveAccessUsage,
  releaseAccessUsageForBooking
} = require("../../lib/access");

const router = express.Router();

function todayDateOnly() {
  return new Date().toISOString().slice(0, 10);
}

function getDateDayOfWeek(bookingDate) {
  return new Date(`${bookingDate}T00:00:00Z`).getUTCDay();
}

function bookingDateTime(bookingDate, startTime) {
  return new Date(`${bookingDate}T${String(startTime).slice(0, 8)}Z`);
}

async function validateBooking(studentId, classScheduleId, bookingDate) {
  const scheduleRows = await db.query(
    `SELECT cs.id, cs.day_of_week, cs.start_time, cs.end_time,
            c.id AS class_id, c.capacity, c.status AS class_status, c.title AS class_title
     FROM class_schedules cs
     INNER JOIN classes c ON c.id = cs.class_id
     WHERE cs.id = ?
     LIMIT 1`,
    [classScheduleId]
  );

  const schedule = scheduleRows[0];
  if (!schedule || schedule.class_status !== "active") {
    return { message: "Horario de aula nao encontrado ou inativo" };
  }

  if (bookingDate < todayDateOnly()) {
    return { message: "Nao e permitido agendar aula em data passada" };
  }

  if (Number(schedule.day_of_week) !== getDateDayOfWeek(bookingDate)) {
    return { message: "A data escolhida nao corresponde ao dia da semana da turma" };
  }

  const duplicate = await db.query(
    `SELECT id
     FROM bookings
     WHERE student_id = ? AND class_schedule_id = ? AND booking_date = ? AND status IN ('scheduled', 'confirmed')
     LIMIT 1`,
    [studentId, classScheduleId, bookingDate]
  );

  if (duplicate[0]) {
    return { message: "Ja existe agendamento para este aluno, horario e data" };
  }

  const capacityRows = await db.query(
    `SELECT COUNT(*) AS booked_count
     FROM bookings
     WHERE class_schedule_id = ?
       AND booking_date = ?
       AND status IN ('scheduled', 'confirmed')`,
    [classScheduleId, bookingDate]
  );

  if (capacityRows[0].booked_count >= schedule.capacity) {
    return { message: "Nao ha vagas disponiveis para esta aula" };
  }

  return { schedule };
}

async function ensureBookingAllowed(studentId, classScheduleId, bookingDate) {
  const validation = await validateBooking(studentId, classScheduleId, bookingDate);
  if (validation.message) {
    throw new ApiError(409, validation.message);
  }
  return validation.schedule;
}

async function createBooking(connection, studentId, classScheduleId, bookingDate, isTrial) {
  const expiresAt = isTrial ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) : null;
  const [result] = await connection.execute(
    `INSERT INTO bookings (student_id, class_schedule_id, booking_date, status, is_trial, expires_at)
     VALUES (?, ?, ?, 'scheduled', ?, ?)`,
    [studentId, classScheduleId, bookingDate, isTrial ? 1 : 0, expiresAt]
  );

  return result.insertId;
}

async function fetchBooking(bookingId) {
  const rows = await db.query(
    `SELECT b.id, b.booking_date, b.status, b.is_trial, b.expires_at,
            b.class_schedule_id, cs.day_of_week, cs.start_time, cs.end_time,
            c.title AS class_title, m.name AS modality_name, i.name AS institution_name
     FROM bookings b
     INNER JOIN class_schedules cs ON cs.id = b.class_schedule_id
     INNER JOIN classes c ON c.id = cs.class_id
     INNER JOIN modalities m ON m.id = c.modality_id
     INNER JOIN institutions i ON i.id = c.institution_id
     WHERE b.id = ?
     LIMIT 1`,
    [bookingId]
  );

  return rows[0] || null;
}

router.get(
  "/",
  auth(["student"]),
  asyncHandler(async (req, res) => {
    const data = await db.query(
      `SELECT b.id, b.booking_date, b.status, b.is_trial, b.expires_at,
              b.class_schedule_id, cs.day_of_week, cs.start_time, cs.end_time,
              c.title AS class_title, m.name AS modality_name, i.name AS institution_name
       FROM bookings b
       INNER JOIN class_schedules cs ON cs.id = b.class_schedule_id
       INNER JOIN classes c ON c.id = cs.class_id
       INNER JOIN modalities m ON m.id = c.modality_id
       INNER JOIN institutions i ON i.id = c.institution_id
       WHERE b.student_id = ?
       ORDER BY b.booking_date, cs.start_time`,
      [req.user.sub]
    );

    return success(res, data, "Agendamentos carregados com sucesso");
  })
);

router.post(
  "/",
  auth(["student"]),
  [
    body("classScheduleId").isInt({ min: 1 }).withMessage("Horario de aula invalido"),
    body("bookingDate").isISO8601().withMessage("Data de agendamento invalida"),
    body("isTrial").optional().isBoolean().withMessage("Modo teste invalido")
  ],
  validateRequest,
  asyncHandler(async (req, res) => {
    await ensureBookingAllowed(req.user.sub, req.body.classScheduleId, req.body.bookingDate);
    const connection = await db.pool.getConnection();

    try {
      await connection.beginTransaction();
      const accessPass = await ensureStudentAccess(req.user.sub, 1, connection);
      const bookingId = await createBooking(
        connection,
        req.user.sub,
        req.body.classScheduleId,
        req.body.bookingDate,
        req.body.isTrial
      );

      await reserveAccessUsage({ accessPassId: accessPass.id, bookingIds: [bookingId] }, connection);

      await auditLog(req.user.sub, "bookings.create", "bookings", bookingId, {
        classScheduleId: req.body.classScheduleId,
        bookingDate: req.body.bookingDate,
        recurring: false,
        accessPassId: accessPass.id
      }, connection);

      await connection.commit();
      return created(res, await fetchBooking(bookingId), "Agendamento criado com sucesso");
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  })
);

router.post(
  "/recurring",
  auth(["student"]),
  [
    body("classScheduleId").isInt({ min: 1 }).withMessage("Horario de aula invalido"),
    body("startDate").isISO8601().withMessage("Data inicial invalida"),
    body("endDate").isISO8601().withMessage("Data final invalida"),
    body("isTrial").optional().isBoolean().withMessage("Modo teste invalido")
  ],
  validateRequest,
  asyncHandler(async (req, res) => {
    const start = new Date(`${req.body.startDate}T00:00:00Z`);
    const end = new Date(`${req.body.endDate}T00:00:00Z`);

    if (start > end) {
      throw new ApiError(400, "A data final deve ser posterior a data inicial");
    }

    const bookingDates = [];
    const conflicts = [];
    const current = new Date(start);

    while (current <= end) {
      const bookingDate = current.toISOString().slice(0, 10);
      bookingDates.push(bookingDate);
      current.setUTCDate(current.getUTCDate() + 7);
    }

    for (const bookingDate of bookingDates) {
      const validation = await validateBooking(req.user.sub, req.body.classScheduleId, bookingDate);
      if (validation.message) {
        conflicts.push({ bookingDate, message: validation.message });
      }
    }

    if (conflicts.length) {
      throw new ApiError(409, "Agendamento recorrente possui conflitos e nenhuma aula foi criada", conflicts);
    }

    const connection = await db.pool.getConnection();

    try {
      await connection.beginTransaction();
      const accessPass = await ensureStudentAccess(req.user.sub, bookingDates.length, connection);
      const createdBookingIds = [];

      for (const bookingDate of bookingDates) {
        const bookingId = await createBooking(
          connection,
          req.user.sub,
          req.body.classScheduleId,
          bookingDate,
          req.body.isTrial
        );
        createdBookingIds.push(bookingId);
      }

      await reserveAccessUsage({ accessPassId: accessPass.id, bookingIds: createdBookingIds }, connection);

      await auditLog(req.user.sub, "bookings.create_recurring", "bookings", null, {
        classScheduleId: req.body.classScheduleId,
        startDate: req.body.startDate,
        endDate: req.body.endDate,
        total: createdBookingIds.length,
        accessPassId: accessPass.id
      }, connection);

      await connection.commit();

      const createdBookings = [];
      for (const bookingId of createdBookingIds) {
        createdBookings.push(await fetchBooking(bookingId));
      }

      return created(res, createdBookings, "Agendamentos recorrentes criados com sucesso");
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  })
);

router.delete(
  "/:id",
  auth(["student"]),
  asyncHandler(async (req, res) => {
    const rows = await db.query(
      `SELECT b.id, b.student_id, b.booking_date, b.status, cs.start_time
       FROM bookings b
       INNER JOIN class_schedules cs ON cs.id = b.class_schedule_id
       WHERE b.id = ?
       LIMIT 1`,
      [req.params.id]
    );
    const booking = rows[0];

    if (!booking || booking.student_id !== req.user.sub) {
      throw new ApiError(404, "Agendamento nao encontrado");
    }

    if (booking.status === "cancelled") {
      throw new ApiError(409, "Agendamento ja esta cancelado");
    }

    const classDateTime = bookingDateTime(booking.booking_date.toISOString ? booking.booking_date.toISOString().slice(0, 10) : booking.booking_date, booking.start_time);
    const limitInMs = env.bookingCancellationLimitHours * 60 * 60 * 1000;
    if (classDateTime.getTime() - Date.now() < limitInMs) {
      throw new ApiError(409, `Cancelamento permitido somente ate ${env.bookingCancellationLimitHours} horas antes da aula`);
    }

    await db.query("UPDATE bookings SET status = 'cancelled' WHERE id = ?", [req.params.id]);
    await releaseAccessUsageForBooking(req.params.id);
    await auditLog(req.user.sub, "bookings.cancel", "bookings", req.params.id);
    return success(res, { id: Number(req.params.id) }, "Agendamento cancelado com sucesso");
  })
);

module.exports = router;
