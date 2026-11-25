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
    `SELECT u.id, u.name, u.email, u.phone, u.gender, u.avatar_url, u.document, r.code AS role
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
      throw new ApiError(404, "Perfil não encontrado");
    }
    return success(res, profile, "Perfil carregado com sucesso");
  })
);

router.put(
  "/",
  auth(),
  [
    body("name").optional().trim().isLength({ min: 3 }).withMessage("Nome inválido"),
    body("phone").optional().trim().isLength({ min: 10 }).withMessage("Telefone inválido"),
    body("document").optional().trim().isLength({ min: 11 }).withMessage("Documento inválido"),
    body("avatarUrl")
      .optional({ checkFalsy: true })
      .custom((value) => {
        const text = String(value);
        const isImageData = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(text);
        const isLink = /^https?:\/\/\S+$/.test(text);
        if (isImageData) return text.length <= 600000;
        return isLink && text.length <= 500;
      })
      .withMessage("Foto inválida ou muito grande")
  ],
  validateRequest,
  asyncHandler(async (req, res) => {
    if (req.body.document) {
      const duplicate = await db.query(
        "SELECT id FROM users WHERE document = ? AND id <> ? LIMIT 1",
        [req.body.document, req.user.sub]
      );

      if (duplicate[0]) {
        throw new ApiError(409, "CPF/CNPJ já cadastrado");
      }
    }

    await db.query(
      `UPDATE users
       SET name = COALESCE(?, name),
           phone = COALESCE(?, phone),
           document = COALESCE(?, document),
           avatar_url = ?
       WHERE id = ?`,
      [
        req.body.name || null,
        req.body.phone || null,
        req.body.document || null,
        req.body.avatarUrl || null,
        req.user.sub
      ]
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
    body("currentPassword").notEmpty().withMessage("Senha atual obrigatória"),
    body("newPassword")
      .isLength({ min: 8 }).withMessage("A nova senha deve ter no mínimo 8 caracteres")
      .matches(/[A-Z]/).withMessage("A nova senha deve conter letra maiúscula")
      .matches(/[a-z]/).withMessage("A nova senha deve conter letra minúscula")
      .matches(/[0-9]/).withMessage("A nova senha deve conter número"),
    body("confirmPassword")
      .custom((value, { req }) => value === req.body.newPassword)
      .withMessage("A confirmação deve ser igual a nova senha")
  ],
  validateRequest,
  asyncHandler(async (req, res) => {
    const rows = await db.query("SELECT password_hash FROM users WHERE id = ? LIMIT 1", [req.user.sub]);
    const user = rows[0];
    if (!user) {
      throw new ApiError(404, "Usuário não encontrado");
    }

    const matches = await comparePassword(req.body.currentPassword, user.password_hash);
    if (!matches) {
      throw new ApiError(400, "Senha atual inválida");
    }

    const passwordHash = await hashPassword(req.body.newPassword);
    await db.query("UPDATE users SET password_hash = ? WHERE id = ?", [passwordHash, req.user.sub]);
    await auditLog(req.user.sub, "profile.password_update", "users", req.user.sub);
    return success(res, null, "Senha alterada com sucesso");
  })
);

module.exports = router;
