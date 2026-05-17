const express = require("express");
const { body } = require("express-validator");
const db = require("../../database/connection");
const {
  ApiError,
  asyncHandler,
  success,
  validateRequest,
  auth,
  comparePassword,
  hashPassword
} = require("../../lib/http");
const { auditLog, getUserInstitutions } = require("../../lib/business");

const router = express.Router();

async function findProfileById(userId) {
  const rows = await db.query(
    `SELECT u.id, u.name, u.email, u.phone, u.document, r.code AS role
     FROM users u
     INNER JOIN roles r ON r.id = u.role_id
     WHERE u.id = ? LIMIT 1`,
    [userId]
  );
  const profile = rows[0] || null;
  if (profile) {
    profile.institutions = await getUserInstitutions(userId);
  }
  return profile;
}

router.get(
  "/",
  auth(),
  asyncHandler(async (req, res) => {
    const profile = await findProfileById(req.user.sub);
    if (!profile) {
      throw new ApiError(404, "Perfil nao encontrado");
    }
    return success(res, profile, "Perfil carregado com sucesso");
  })
);

router.put(
  "/",
  auth(),
  [
    body("name").optional().trim().isLength({ min: 3 }).withMessage("Nome invalido"),
    body("phone").optional().trim().isLength({ min: 10 }).withMessage("Telefone invalido"),
    body("document").optional().trim().isLength({ min: 11 }).withMessage("Documento invalido")
  ],
  validateRequest,
  asyncHandler(async (req, res) => {
    if (req.body.document) {
      const duplicate = await db.query(
        "SELECT id FROM users WHERE document = ? AND id <> ? LIMIT 1",
        [req.body.document, req.user.sub]
      );

      if (duplicate[0]) {
        throw new ApiError(409, "CPF/CNPJ ja cadastrado");
      }
    }

    await db.query(
      `UPDATE users
       SET name = COALESCE(?, name),
           phone = COALESCE(?, phone),
           document = COALESCE(?, document)
       WHERE id = ?`,
      [req.body.name || null, req.body.phone || null, req.body.document || null, req.user.sub]
    );

    const profile = await findProfileById(req.user.sub);
    await auditLog(req.user.sub, "profile.update", "users", req.user.sub, {
      fields: Object.keys(req.body)
    });
    return success(res, profile, "Perfil atualizado com sucesso");
  })
);

router.put(
  "/password",
  auth(),
  [
    body("currentPassword").notEmpty().withMessage("Senha atual obrigatoria"),
    body("newPassword")
      .isLength({ min: 8 }).withMessage("A nova senha deve ter no minimo 8 caracteres")
      .matches(/[A-Z]/).withMessage("A nova senha deve conter letra maiuscula")
      .matches(/[a-z]/).withMessage("A nova senha deve conter letra minuscula")
      .matches(/[0-9]/).withMessage("A nova senha deve conter numero"),
    body("confirmPassword")
      .custom((value, { req }) => value === req.body.newPassword)
      .withMessage("A confirmacao deve ser igual a nova senha")
  ],
  validateRequest,
  asyncHandler(async (req, res) => {
    const rows = await db.query("SELECT password_hash FROM users WHERE id = ? LIMIT 1", [req.user.sub]);
    const user = rows[0];
    if (!user) {
      throw new ApiError(404, "Usuario nao encontrado");
    }

    const matches = await comparePassword(req.body.currentPassword, user.password_hash);
    if (!matches) {
      throw new ApiError(400, "Senha atual invalida");
    }

    const passwordHash = await hashPassword(req.body.newPassword);
    await db.query("UPDATE users SET password_hash = ? WHERE id = ?", [passwordHash, req.user.sub]);
    await auditLog(req.user.sub, "profile.password_update", "users", req.user.sub);
    return success(res, null, "Senha alterada com sucesso");
  })
);

module.exports = router;
