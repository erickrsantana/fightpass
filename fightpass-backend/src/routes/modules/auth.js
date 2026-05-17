const express = require("express");
const { body } = require("express-validator");
const db = require("../../database/connection");
const {
  ApiError,
  asyncHandler,
  success,
  created,
  validateRequest,
  signToken,
  auth,
  hashPassword,
  comparePassword
} = require("../../lib/http");
const { auditLog, getUserInstitutions } = require("../../lib/business");
const { createTrialAccess, isValidCpf, onlyDigits } = require("../../lib/access");
const { requestPasswordReset, resetPassword } = require("../../services/passwordResetService");

const router = express.Router();

async function findUserByEmail(email) {
  const rows = await db.query(
    `SELECT u.id, u.name, u.email, u.password_hash, u.document, u.phone, u.is_active, r.code AS role, r.id AS role_id
     FROM users u
     INNER JOIN roles r ON r.id = u.role_id
     WHERE u.email = ? LIMIT 1`,
    [email]
  );
  return rows[0] || null;
}

async function findUserByDocument(document) {
  const documentDigits = onlyDigits(document);
  const rows = await db.query(
    `SELECT id
     FROM users
     WHERE document = ?
        OR REPLACE(REPLACE(REPLACE(document, '.', ''), '-', ''), '/', '') = ?
     LIMIT 1`,
    [document, documentDigits]
  );
  return rows[0] || null;
}

async function findInstitutionByLegalDocument(document) {
  const documentDigits = onlyDigits(document);
  const rows = await db.query(
    `SELECT id
     FROM institutions
     WHERE legal_document = ?
        OR REPLACE(REPLACE(REPLACE(legal_document, '.', ''), '-', ''), '/', '') = ?
     LIMIT 1`,
    [document, documentDigits]
  );
  return rows[0] || null;
}

async function findUserById(id) {
  const rows = await db.query(
    `SELECT u.id, u.name, u.email, u.document, u.phone, u.is_active, r.code AS role
     FROM users u
     INNER JOIN roles r ON r.id = u.role_id
     WHERE u.id = ? LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function serializeUser(user) {
  const institutions = await getUserInstitutions(user.id);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    document: user.document,
    phone: user.phone,
    institutions
  };
}

router.post(
  "/register",
  [
    body("name").trim().notEmpty().withMessage("Nome obrigatorio"),
    body("email").isEmail().withMessage("Email invalido").normalizeEmail(),
    body("password")
      .isLength({ min: 8 }).withMessage("A senha deve ter no minimo 8 caracteres")
      .matches(/[A-Z]/).withMessage("A senha deve conter letra maiuscula")
      .matches(/[a-z]/).withMessage("A senha deve conter letra minuscula")
      .matches(/[0-9]/).withMessage("A senha deve conter numero"),
    body("document")
      .trim()
      .isLength({ min: 11 }).withMessage("Documento invalido")
      .custom((value, { req }) => {
        if (req.body.accountType === "student" && !isValidCpf(value)) {
          throw new Error("CPF invalido para cadastro de aluno");
        }
        return true;
      }),
    body("accountType").isIn(["student", "instructor", "institution_admin"]).withMessage("Tipo de conta invalido"),
    body("institutionName").optional().trim().isLength({ min: 3 }).withMessage("Nome da instituicao invalido")
  ],
  validateRequest,
  asyncHandler(async (req, res) => {
    const existing = await findUserByEmail(req.body.email);
    if (existing) {
      throw new ApiError(409, "Ja existe um usuario com este email");
    }

    const existingDocument = await findUserByDocument(req.body.document);
    if (existingDocument) {
      throw new ApiError(409, "CPF/CNPJ ja cadastrado");
    }

    if (req.body.accountType === "institution_admin") {
      const existingInstitution = await findInstitutionByLegalDocument(req.body.document);
      if (existingInstitution) {
        throw new ApiError(409, "Ja existe uma instituicao com este CNPJ");
      }
    }

    const roles = await db.query("SELECT id, code FROM roles WHERE code = ? LIMIT 1", [req.body.accountType]);
    const role = roles[0];
    if (!role) {
      throw new ApiError(400, "Perfil de usuario invalido");
    }

    const connection = await db.pool.getConnection();

    try {
      await connection.beginTransaction();
      const passwordHash = await hashPassword(req.body.password);
      const [insertUser] = await connection.execute(
        `INSERT INTO users (role_id, name, email, password_hash, document, phone, is_active)
         VALUES (?, ?, ?, ?, ?, ?, 1)`,
        [role.id, req.body.name, req.body.email, passwordHash, req.body.document, req.body.phone || null]
      );

      let institutionId = null;

      if (req.body.accountType === "institution_admin") {
        const [insertInstitution] = await connection.execute(
          `INSERT INTO institutions (owner_user_id, name, legal_document, email, phone, description, status)
           VALUES (?, ?, ?, ?, ?, ?, 'active')`,
          [
            insertUser.insertId,
            req.body.institutionName || req.body.name,
            req.body.document,
            req.body.email,
            req.body.phone || null,
            req.body.description || null
          ]
        );

        institutionId = insertInstitution.insertId;

        await connection.execute(
          `INSERT INTO institution_user (institution_id, user_id, membership_role, status)
           VALUES (?, ?, 'institution_admin', 'active')`,
          [institutionId, insertUser.insertId]
        );

        await connection.execute(
          `INSERT IGNORE INTO institution_modality (institution_id, modality_id)
           SELECT ?, id
           FROM modalities
           WHERE slug IN ('boxe', 'jiu-jitsu', 'judo', 'muay-thai', 'mma', 'karate', 'taekwondo')`,
          [institutionId]
        );
      }

      let access = null;
      if (req.body.accountType === "student") {
        access = await createTrialAccess({
          userId: insertUser.insertId,
          document: req.body.document
        }, connection);
      }

      await auditLog(
        insertUser.insertId,
        "auth.register",
        req.body.accountType === "institution_admin" ? "institutions" : "users",
        institutionId || insertUser.insertId,
        { role: req.body.accountType, trialAccess: Boolean(access) },
        connection
      );

      await connection.commit();

      const user = await findUserById(insertUser.insertId);
      const token = signToken(user);
      return created(res, {
        user: await serializeUser(user),
        token,
        institutionId,
        access
      }, "Conta criada com sucesso");
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  })
);

router.post(
  "/login",
  [
    body("email").isEmail().withMessage("Email invalido").normalizeEmail(),
    body("password").notEmpty().withMessage("Senha obrigatoria")
  ],
  validateRequest,
  asyncHandler(async (req, res) => {
    const user = await findUserByEmail(req.body.email);
    if (!user || !user.is_active) {
      throw new ApiError(401, "Credenciais invalidas");
    }

    const matches = await comparePassword(req.body.password, user.password_hash);
    if (!matches) {
      throw new ApiError(401, "Credenciais invalidas");
    }

    const token = signToken(user);
    const serializedUser = await serializeUser(user);
    await auditLog(user.id, "auth.login", "users", user.id);

    return success(res, {
      token,
      user: serializedUser
    }, "Login realizado com sucesso");
  })
);

router.post(
  "/forgot-password",
  [body("email").isEmail().withMessage("Email invalido").normalizeEmail()],
  validateRequest,
  asyncHandler(async (req, res) => {
    const user = await findUserByEmail(req.body.email);
    if (user) {
      try {
        const emailResult = await requestPasswordReset(user, {
          ip: req.ip,
          userAgent: req.headers["user-agent"]
        });

        if (emailResult.skipped) {
          console.warn(`[email] Recuperacao de senha sem envio: ${emailResult.reason}`);
        }
      } catch (error) {
        console.error("[email] Falha ao enviar recuperacao de senha:", error.message);
      }
    }

    return success(
      res,
      { nextStep: "Verifique o email informado para acessar o link de redefinicao." },
      "Se o email estiver cadastrado, as instrucoes de recuperacao serao enviadas."
    );
  })
);

router.post(
  "/reset-password",
  [
    body("token").notEmpty().withMessage("Token obrigatorio"),
    body("password")
      .isLength({ min: 8 }).withMessage("A senha deve ter no minimo 8 caracteres")
      .matches(/[A-Z]/).withMessage("A senha deve conter letra maiuscula")
      .matches(/[a-z]/).withMessage("A senha deve conter letra minuscula")
      .matches(/[0-9]/).withMessage("A senha deve conter numero")
  ],
  validateRequest,
  asyncHandler(async (req, res) => {
    await resetPassword(req.body.token, req.body.password);
    return success(res, null, "Senha redefinida com sucesso");
  })
);

router.get(
  "/me",
  auth(),
  asyncHandler(async (req, res) => {
    const user = await findUserById(req.user.sub);
    if (!user) {
      throw new ApiError(404, "Usuario nao encontrado");
    }
    return success(res, await serializeUser(user), "Perfil autenticado carregado com sucesso");
  })
);

router.post("/logout", auth(), asyncHandler(async (req, res) => success(res, null, "Logout realizado com sucesso")));

module.exports = router;
