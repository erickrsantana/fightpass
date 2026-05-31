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
    query("modalities").optional().trim(),
    query("search").optional().trim(),
    query("near").optional().trim(),
    query("lat").optional().isFloat({ min: -90, max: 90 }).withMessage("Latitude invalida"),
    query("lng").optional().isFloat({ min: -180, max: 180 }).withMessage("Longitude invalida")
  ],
  validateRequest,
  asyncHandler(async (req, res) => {
    const conditions = ["i.status = 'active'"];
    const params = [];
    const selectedModalities = String(req.query.modalities || req.query.modality || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    if (selectedModalities.length) {
      conditions.push(`
        i.id IN (
          SELECT im2.institution_id
          FROM institution_modality im2
          INNER JOIN modalities m2 ON m2.id = im2.modality_id
          WHERE m2.slug IN (${selectedModalities.map(() => "?").join(", ")})
          GROUP BY im2.institution_id
          HAVING COUNT(DISTINCT m2.slug) = ?
        )
      `);
      params.push(...selectedModalities, selectedModalities.length);
    }

    if (req.query.search) {
      conditions.push("(i.name LIKE ? OR m.name LIKE ?)");
      params.push(`%${req.query.search}%`, `%${req.query.search}%`);
    }

    if (req.query.near) {
      conditions.push("(a.formatted_address LIKE ? OR a.neighborhood LIKE ? OR a.city LIKE ? OR a.state LIKE ? OR a.zip_code LIKE ?)");
      params.push(
        `%${req.query.near}%`,
        `%${req.query.near}%`,
        `%${req.query.near}%`,
        `%${req.query.near}%`,
        `%${req.query.near}%`
      );
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const hasReferencePoint = req.query.lat && req.query.lng;
    const distanceSelect = hasReferencePoint
      ? `, CASE
            WHEN a.latitude IS NULL OR a.longitude IS NULL THEN NULL
            ELSE ROUND(
              6371 * ACOS(
                COS(RADIANS(?)) * COS(RADIANS(a.latitude)) *
                COS(RADIANS(a.longitude) - RADIANS(?)) +
                SIN(RADIANS(?)) * SIN(RADIANS(a.latitude))
              ),
              2
            )
          END AS distance_km`
      : ", NULL AS distance_km";
    const distanceParams = hasReferencePoint
      ? [Number(req.query.lat), Number(req.query.lng), Number(req.query.lat)]
      : [];
    const orderBy = hasReferencePoint ? "distance_km IS NULL, distance_km, i.name" : "i.name";

    const data = await db.query(
      `SELECT DISTINCT i.id, i.name, i.description, i.phone, i.email, i.status,
              a.street, a.number, a.complement, a.city, a.state, a.neighborhood,
              a.zip_code, a.formatted_address, a.latitude, a.longitude, a.geocoding_status
              ${distanceSelect}
       FROM institutions i
       LEFT JOIN addresses a ON a.institution_id = i.id
       LEFT JOIN institution_modality im ON im.institution_id = i.id
       LEFT JOIN modalities m ON m.id = im.modality_id
       ${where}
       ORDER BY ${orderBy}`,
      [...distanceParams, ...params]
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
      `SELECT u.id, u.name, u.email, u.gender, u.avatar_url, e.status AS enrollment_status, m.id AS modality_id, m.name AS modality_name
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
