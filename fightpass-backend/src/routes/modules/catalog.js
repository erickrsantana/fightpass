const express = require("express");
const { body, query } = require("express-validator");
const db = require("../../database/connection");
const { asyncHandler, success, ApiError, auth, validateRequest } = require("../../lib/http");
const { auditLog, ensureInstitutionAccess } = require("../../lib/business");
const { resolveCep, upsertInstitutionAddress } = require("../../services/locationService");

const router = express.Router();

router.get(
  "/locations/cep/:cep",
  auth(["institution_admin", "instructor"]),
  asyncHandler(async (req, res) => {
    const data = await resolveCep(req.params.cep, req.query.number || null, req.query.complement || null);
    return success(res, data, "Localizacao carregada com sucesso");
  })
);

router.put(
  "/institutions/:id/address",
  auth(["institution_admin"]),
  [
    body("zipCode").trim().notEmpty().withMessage("CEP obrigatorio"),
    body("number").trim().notEmpty().withMessage("Numero obrigatorio"),
    body("complement").optional({ nullable: true }).trim()
  ],
  validateRequest,
  asyncHandler(async (req, res) => {
    await ensureInstitutionAccess(req.user.sub, req.params.id, ["institution_admin"]);
    const address = await upsertInstitutionAddress(req.params.id, {
      zipCode: req.body.zipCode,
      number: req.body.number,
      complement: req.body.complement || null
    });
    await auditLog(req.user.sub, "institutions.address.update", "institutions", req.params.id, {
      zipCode: address.zipCode,
      geocodingStatus: address.geocodingStatus
    });
    return success(res, address, "Endereco atualizado com sucesso");
  })
);

router.get(
  "/modalities",
  asyncHandler(async (req, res) => {
    const data = await db.query("SELECT id, name, slug, description FROM modalities ORDER BY name");
    return success(res, data, "Modalidades carregadas com sucesso");
  })
);

router.get(
  "/map/search",
  [
    query("modality").optional().trim(),
    query("search").optional().trim()
  ],
  validateRequest,
  asyncHandler(async (req, res) => {
    const conditions = ["i.status = 'active'"];
    const params = [];

    if (req.query.modality) {
      conditions.push("m.slug = ?");
      params.push(req.query.modality);
    }

    if (req.query.search) {
      conditions.push("i.name LIKE ?");
      params.push(`%${req.query.search}%`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const data = await db.query(
      `SELECT DISTINCT i.id, i.name, i.description, i.phone, i.email, i.status,
              a.street, a.number, a.complement, a.city, a.state, a.neighborhood,
              a.zip_code, a.formatted_address, a.latitude, a.longitude, a.geocoding_status
       FROM institutions i
       LEFT JOIN addresses a ON a.institution_id = i.id
       LEFT JOIN institution_modality im ON im.institution_id = i.id
       LEFT JOIN modalities m ON m.id = im.modality_id
       ${where}
       ORDER BY i.name`,
      params
    );

    return success(res, data, "Instituicoes carregadas com sucesso");
  })
);

router.get(
  "/institutions",
  asyncHandler(async (req, res) => {
    const data = await db.query(
      `SELECT i.id, i.name, i.description, i.phone, i.email, i.status, a.city, a.state
       FROM institutions i
       LEFT JOIN addresses a ON a.institution_id = i.id
       ORDER BY i.name`
    );
    return success(res, data, "Instituicoes carregadas com sucesso");
  })
);

router.get(
  "/institutions/:id",
  asyncHandler(async (req, res) => {
    const rows = await db.query(
      `SELECT i.id, i.name, i.description, i.phone, i.email, i.status,
              a.street, a.number, a.complement, a.neighborhood, a.city, a.state,
              a.zip_code, a.formatted_address, a.latitude, a.longitude, a.geocoding_status
       FROM institutions i
       LEFT JOIN addresses a ON a.institution_id = i.id
       WHERE i.id = ? LIMIT 1`,
      [req.params.id]
    );

    const institution = rows[0];
    if (!institution) {
      throw new ApiError(404, "Instituicao nao encontrada");
    }

    institution.modalities = await db.query(
      `SELECT m.id, m.name, m.slug
       FROM institution_modality im
       INNER JOIN modalities m ON m.id = im.modality_id
       WHERE im.institution_id = ?
       ORDER BY m.name`,
      [req.params.id]
    );

    institution.classes = await db.query(
      `SELECT c.id, c.modality_id, c.title, c.description, c.capacity, c.status,
              m.name AS modality_name,
              cs.id AS schedule_id, cs.day_of_week, cs.start_time, cs.end_time, cs.room_name
       FROM classes c
       INNER JOIN modalities m ON m.id = c.modality_id
       LEFT JOIN class_schedules cs ON cs.class_id = c.id
       WHERE c.institution_id = ? AND c.status = 'active'
       ORDER BY c.title, cs.day_of_week, cs.start_time`,
      [req.params.id]
    );

    return success(res, institution, "Instituicao carregada com sucesso");
  })
);

router.get(
  "/institutions/:id/students",
  auth(["institution_admin", "instructor"]),
  asyncHandler(async (req, res) => {
    await ensureInstitutionAccess(req.user.sub, req.params.id);
    const data = await db.query(
      `SELECT u.id, u.name, u.email, e.status AS enrollment_status, m.id AS modality_id, m.name AS modality_name
       FROM enrollments e
       INNER JOIN users u ON u.id = e.student_id
       INNER JOIN modalities m ON m.id = e.modality_id
       WHERE e.institution_id = ?
       ORDER BY u.name`,
      [req.params.id]
    );

    return success(res, data, "Alunos da instituicao carregados com sucesso");
  })
);

module.exports = router;
