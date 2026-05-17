const express = require("express");
const { body, param } = require("express-validator");
const db = require("../../database/connection");
const { asyncHandler, created, success, validateRequest, auth, ApiError } = require("../../lib/http");
const {
  auditLog,
  ensureInstitutionAccess,
  ensureInstitutionModality
} = require("../../lib/business");
const { ensureActiveInstitutionSubscription } = require("../../services/dojoSubscriptionService");

const router = express.Router();

function normalizeTime(value) {
  return value && value.length === 5 ? `${value}:00` : value;
}

async function findClassForManagement(classId) {
  const rows = await db.query(
    `SELECT id, institution_id, modality_id, title, status
     FROM classes
     WHERE id = ?
     LIMIT 1`,
    [classId]
  );

  if (!rows[0]) {
    throw new ApiError(404, "Turma nao encontrada");
  }

  return rows[0];
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const conditions = ["c.status = 'active'"];
    const params = [];

    if (req.query.institutionId) {
      conditions.push("c.institution_id = ?");
      params.push(req.query.institutionId);
    }

    if (req.query.modalityId) {
      conditions.push("c.modality_id = ?");
      params.push(req.query.modalityId);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const data = await db.query(
      `SELECT c.id, c.institution_id, c.modality_id, c.title, c.description, c.capacity, c.status,
              i.name AS institution_name, m.name AS modality_name
       FROM classes c
       INNER JOIN institutions i ON i.id = c.institution_id
       INNER JOIN modalities m ON m.id = c.modality_id
       ${where}
       ORDER BY c.title`,
      params
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

    return success(res, data, "Turmas carregadas com sucesso");
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const rows = await db.query(
      `SELECT c.id, c.institution_id, c.modality_id, c.title, c.description, c.capacity, c.status
       FROM classes c
       WHERE c.id = ? LIMIT 1`,
      [req.params.id]
    );
    const classData = rows[0];
    if (!classData) {
      throw new ApiError(404, "Turma nao encontrada");
    }

    classData.schedules = await db.query(
      `SELECT id, day_of_week, start_time, end_time, room_name
       FROM class_schedules
       WHERE class_id = ?
       ORDER BY day_of_week, start_time`,
      [req.params.id]
    );
    return success(res, classData, "Turma carregada com sucesso");
  })
);

router.post(
  "/",
  auth(["institution_admin", "instructor"]),
  [
    body("institutionId").isInt({ min: 1 }).withMessage("Instituicao invalida"),
    body("modalityId").isInt({ min: 1 }).withMessage("Modalidade invalida"),
    body("title").trim().notEmpty().withMessage("Titulo obrigatorio"),
    body("dayOfWeek").isInt({ min: 0, max: 6 }).withMessage("Dia da semana invalido"),
    body("startTime").matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).withMessage("Horario inicial invalido"),
    body("endTime").matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).withMessage("Horario final invalido"),
    body("capacity").isInt({ min: 1 }).withMessage("Capacidade invalida")
  ],
  validateRequest,
  asyncHandler(async (req, res) => {
    await ensureInstitutionAccess(req.user.sub, req.body.institutionId);
    await ensureActiveInstitutionSubscription(req.body.institutionId);
    await ensureInstitutionModality(req.body.institutionId, req.body.modalityId);

    const startTime = normalizeTime(req.body.startTime);
    const endTime = normalizeTime(req.body.endTime);

    if (startTime >= endTime) {
      throw new ApiError(400, "Horario final deve ser posterior ao horario inicial");
    }

    const connection = await db.pool.getConnection();

    try {
      await connection.beginTransaction();
      const [classInsert] = await connection.execute(
        `INSERT INTO classes (institution_id, modality_id, title, description, capacity, status)
         VALUES (?, ?, ?, ?, ?, 'active')`,
        [
          req.body.institutionId,
          req.body.modalityId,
          req.body.title,
          req.body.description || null,
          req.body.capacity
        ]
      );

      await connection.execute(
        `INSERT INTO class_schedules (class_id, day_of_week, start_time, end_time, room_name)
         VALUES (?, ?, ?, ?, ?)`,
        [
          classInsert.insertId,
          req.body.dayOfWeek,
          startTime,
          endTime,
          req.body.roomName || null
        ]
      );

      await auditLog(req.user.sub, "classes.create", "classes", classInsert.insertId, {
        institutionId: req.body.institutionId,
        modalityId: req.body.modalityId,
        dayOfWeek: req.body.dayOfWeek,
        startTime,
        endTime
      }, connection);

      await connection.commit();

      const rows = await db.query("SELECT id, title, capacity, status FROM classes WHERE id = ? LIMIT 1", [classInsert.insertId]);
      return created(res, rows[0], "Turma criada com sucesso");
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  })
);

router.put(
  "/:id",
  auth(["institution_admin", "instructor"]),
  [
    param("id").isInt({ min: 1 }).withMessage("Turma invalida"),
    body("modalityId").isInt({ min: 1 }).withMessage("Modalidade invalida"),
    body("title").trim().notEmpty().withMessage("Titulo obrigatorio"),
    body("description").optional({ nullable: true }).trim(),
    body("capacity").isInt({ min: 1 }).withMessage("Capacidade invalida"),
    body("status").optional().isIn(["active", "inactive"]).withMessage("Status invalido")
  ],
  validateRequest,
  asyncHandler(async (req, res) => {
    const classData = await findClassForManagement(req.params.id);
    await ensureInstitutionAccess(req.user.sub, classData.institution_id);
    await ensureActiveInstitutionSubscription(classData.institution_id);
    await ensureInstitutionModality(classData.institution_id, req.body.modalityId);

    await db.query(
      `UPDATE classes
       SET modality_id = ?, title = ?, description = ?, capacity = ?, status = ?
       WHERE id = ?`,
      [
        req.body.modalityId,
        req.body.title,
        req.body.description || null,
        req.body.capacity,
        req.body.status || classData.status,
        req.params.id
      ]
    );
    await auditLog(req.user.sub, "classes.update", "classes", req.params.id, {
      institutionId: classData.institution_id,
      modalityId: req.body.modalityId
    });

    const rows = await db.query(
      "SELECT id, institution_id, modality_id, title, description, capacity, status FROM classes WHERE id = ? LIMIT 1",
      [req.params.id]
    );
    return success(res, rows[0], "Turma atualizada com sucesso");
  })
);

router.patch(
  "/:id/status",
  auth(["institution_admin", "instructor"]),
  [
    param("id").isInt({ min: 1 }).withMessage("Turma invalida"),
    body("status").isIn(["active", "inactive"]).withMessage("Status invalido")
  ],
  validateRequest,
  asyncHandler(async (req, res) => {
    const classData = await findClassForManagement(req.params.id);
    await ensureInstitutionAccess(req.user.sub, classData.institution_id);
    await ensureActiveInstitutionSubscription(classData.institution_id);

    await db.query("UPDATE classes SET status = ? WHERE id = ?", [req.body.status, req.params.id]);
    await auditLog(req.user.sub, "classes.status.update", "classes", req.params.id, {
      status: req.body.status,
      institutionId: classData.institution_id
    });

    return success(res, { id: Number(req.params.id), status: req.body.status }, "Status da turma atualizado com sucesso");
  })
);

router.post(
  "/:id/schedules",
  auth(["institution_admin", "instructor"]),
  [
    param("id").isInt({ min: 1 }).withMessage("Turma invalida"),
    body("dayOfWeek").isInt({ min: 0, max: 6 }).withMessage("Dia da semana invalido"),
    body("startTime").matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).withMessage("Horario inicial invalido"),
    body("endTime").matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).withMessage("Horario final invalido"),
    body("roomName").optional({ nullable: true }).trim()
  ],
  validateRequest,
  asyncHandler(async (req, res) => {
    const classData = await findClassForManagement(req.params.id);
    await ensureInstitutionAccess(req.user.sub, classData.institution_id);
    await ensureActiveInstitutionSubscription(classData.institution_id);

    const startTime = normalizeTime(req.body.startTime);
    const endTime = normalizeTime(req.body.endTime);
    if (startTime >= endTime) {
      throw new ApiError(400, "Horario final deve ser posterior ao horario inicial");
    }

    const result = await db.query(
      `INSERT INTO class_schedules (class_id, day_of_week, start_time, end_time, room_name)
       VALUES (?, ?, ?, ?, ?)`,
      [req.params.id, req.body.dayOfWeek, startTime, endTime, req.body.roomName || null]
    );
    await auditLog(req.user.sub, "class_schedules.create", "class_schedules", result.insertId || null, {
      classId: req.params.id,
      institutionId: classData.institution_id
    });

    return created(res, {
      classId: Number(req.params.id),
      dayOfWeek: Number(req.body.dayOfWeek),
      startTime,
      endTime,
      roomName: req.body.roomName || null
    }, "Horario criado com sucesso");
  })
);

module.exports = router;
