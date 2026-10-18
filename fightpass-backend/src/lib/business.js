const db = require("../database/connection");
const { ApiError } = require("./http");

async function auditLog(userId, action, entityName, entityId = null, payload = null, connection = null) {
  const executor = connection || db;
  const payloadJson = payload ? JSON.stringify(payload) : null;
  await executor.query(
    `INSERT INTO audit_logs (user_id, action, entity_name, entity_id, payload_json)
     VALUES (?, ?, ?, ?, ?)`,
    [userId || null, action, entityName, entityId, payloadJson]
  );
}

async function getUserInstitutions(userId, allowedRoles = []) {
  const roleFilter = allowedRoles.length
    ? `AND iu.membership_role IN (${allowedRoles.map(() => "?").join(", ")})`
    : "";

  return db.query(
    `SELECT i.id, i.name, iu.membership_role AS role
     FROM institution_user iu
     INNER JOIN institutions i ON i.id = iu.institution_id
     WHERE iu.user_id = ? AND iu.status = 'active' AND i.status = 'active'
     ${roleFilter}
     ORDER BY i.name`,
    [userId, ...allowedRoles]
  );
}

async function ensureInstitutionAccess(userId, institutionId, allowedRoles = ["institution_admin", "instructor"]) {
  const rows = await db.query(
    `SELECT iu.institution_id, iu.membership_role
     FROM institution_user iu
     INNER JOIN institutions i ON i.id = iu.institution_id
     WHERE iu.user_id = ?
       AND iu.institution_id = ?
       AND iu.status = 'active'
       AND i.status = 'active'
       AND iu.membership_role IN (${allowedRoles.map(() => "?").join(", ")})
     LIMIT 1`,
    [userId, institutionId, ...allowedRoles]
  );

  if (!rows[0]) {
    throw new ApiError(403, "Usuario sem permissao para esta instituicao");
  }

  return rows[0];
}

async function ensureStudentInInstitution(studentId, institutionId) {
  const rows = await db.query(
    `SELECT e.id, e.modality_id, m.name AS modality_name
     FROM enrollments e
     INNER JOIN modalities m ON m.id = e.modality_id
     WHERE e.student_id = ?
       AND e.institution_id = ?
       AND e.status IN ('active', 'trial')
     LIMIT 1`,
    [studentId, institutionId]
  );

  if (!rows[0]) {
    throw new ApiError(403, "Aluno nao pertence a instituicao informada");
  }

  return rows[0];
}

async function findSharedInstitution(studentId, evaluatorUserId) {
  const rows = await db.query(
    `SELECT e.institution_id
     FROM enrollments e
     INNER JOIN institution_user iu ON iu.institution_id = e.institution_id
     WHERE e.student_id = ?
       AND e.status IN ('active', 'trial')
       AND iu.user_id = ?
       AND iu.status = 'active'
       AND iu.membership_role IN ('institution_admin', 'instructor')
     ORDER BY e.institution_id
     LIMIT 1`,
    [studentId, evaluatorUserId]
  );

  if (!rows[0]) {
    throw new ApiError(403, "Usuario sem permissao para acessar este aluno");
  }

  return rows[0].institution_id;
}

async function ensureInstitutionModality(institutionId, modalityId) {
  const rows = await db.query(
    `SELECT id
     FROM institution_modality
     WHERE institution_id = ? AND modality_id = ?
     LIMIT 1`,
    [institutionId, modalityId]
  );

  if (!rows[0]) {
    throw new ApiError(400, "Modalidade nao vinculada a instituicao");
  }
}

async function ensureInstitutionInstructor(institutionId, instructorId) {
  const rows = await db.query(
    `SELECT iu.user_id
     FROM institution_user iu
     INNER JOIN users u ON u.id = iu.user_id
     WHERE iu.institution_id = ? AND iu.user_id = ?
       AND iu.membership_role = 'instructor' AND iu.status = 'active' AND u.is_active = 1
     LIMIT 1`,
    [institutionId, instructorId]
  );
  if (!rows[0]) {
    throw new ApiError(400, "Instrutor invalido para esta instituicao");
  }
}

function slugify(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "modalidade";
}

// Usa uma modalidade existente (por id) ou cria uma nova pelo nome e vincula a academia.
async function resolveInstitutionModality(institutionId, modalityId, modalityName) {
  if (modalityId) {
    await ensureInstitutionModality(institutionId, modalityId);
    return Number(modalityId);
  }

  const name = String(modalityName || "").trim();
  if (name.length < 2) {
    throw new ApiError(422, "Informe a modalidade");
  }

  let rows = await db.query("SELECT id FROM modalities WHERE LOWER(name) = LOWER(?) LIMIT 1", [name]);
  let id = rows[0] ? rows[0].id : null;

  if (!id) {
    const baseSlug = slugify(name);
    let slug = baseSlug;
    let attempt = 1;
    while ((await db.query("SELECT id FROM modalities WHERE slug = ? LIMIT 1", [slug]))[0]) {
      attempt += 1;
      slug = `${baseSlug}-${attempt}`;
    }
    const insert = await db.query(
      "INSERT INTO modalities (name, slug, description) VALUES (?, ?, NULL)",
      [name.slice(0, 100), slug]
    );
    id = insert.insertId;
  }

  const linked = await db.query(
    "SELECT id FROM institution_modality WHERE institution_id = ? AND modality_id = ? LIMIT 1",
    [institutionId, id]
  );
  if (!linked[0]) {
    await db.query("INSERT INTO institution_modality (institution_id, modality_id) VALUES (?, ?)", [institutionId, id]);
  }
  return Number(id);
}

module.exports = {
  ensureInstitutionInstructor,
  resolveInstitutionModality,
  auditLog,
  getUserInstitutions,
  ensureInstitutionAccess,
  ensureStudentInInstitution,
  findSharedInstitution,
  ensureInstitutionModality
};
