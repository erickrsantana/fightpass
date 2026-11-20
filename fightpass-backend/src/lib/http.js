const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { validationResult } = require("express-validator");
const env = require("../config/env");
const db = require("../database/connection");

class ApiError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function success(res, data, message = "Operacao realizada com sucesso", status = 200) {
  return res.status(status).json({ success: true, message, data });
}

function created(res, data, message = "Registro criado com sucesso") {
  return success(res, data, message, 201);
}

function validateRequest(req, res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) {
    return next();
  }
  return next(new ApiError(422, "Dados invalidos", result.array()));
}

// Algoritmo fixado: impede ataques de troca de algoritmo ("alg: none" ou HS/RS).
const JWT_ALGORITHM = "HS256";

function signToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email },
    env.jwt.secret,
    { expiresIn: env.jwt.expiresIn, algorithm: JWT_ALGORITHM }
  );
}

// Cache curto do estado da conta: derruba o acesso de quem foi desativado sem consultar o banco a cada clique.
const AUTH_CACHE_TTL_MS = 30 * 1000;
const authCache = new Map();

function invalidateAuthCache(userId) {
  if (userId === undefined) authCache.clear();
  else authCache.delete(Number(userId));
}

async function loadAccountState(userId) {
  const id = Number(userId);
  const cached = authCache.get(id);
  if (cached && Date.now() - cached.at < AUTH_CACHE_TTL_MS) return cached.state;
  const rows = await db.query("SELECT is_active, email_verified_at FROM users WHERE id = ? LIMIT 1", [id]);
  const row = rows[0];
  const state = row
    ? { active: Boolean(row.is_active), verified: Boolean(row.email_verified_at) }
    : { active: false, verified: false };
  if (authCache.size > 5000) authCache.clear();
  authCache.set(id, { at: Date.now(), state });
  return state;
}

function auth(requiredRoles = []) {
  return async (req, res, next) => {
    const header = req.headers.authorization || "";
    const [scheme, token] = header.split(" ");

    if (!token || String(scheme).toLowerCase() !== "bearer") {
      return next(new ApiError(401, "Nao autenticado"));
    }

    let payload;
    try {
      payload = jwt.verify(token, env.jwt.secret, { algorithms: [JWT_ALGORITHM] });
    } catch (error) {
      return next(new ApiError(401, "Token invalido ou expirado"));
    }

    try {
      const state = await loadAccountState(payload.sub);
      if (!state.active) {
        return next(new ApiError(401, "Conta desativada ou inexistente"));
      }
      if (env.emailVerification.required && !state.verified) {
        return next(new ApiError(403, "Confirme seu e-mail para acessar o sistema", { code: "EMAIL_NOT_VERIFIED" }));
      }
    } catch (error) {
      return next(error);
    }

    req.user = payload;
    if (requiredRoles.length > 0 && !requiredRoles.includes(payload.role)) {
      return next(new ApiError(403, "Acesso negado para este perfil"));
    }
    return next();
  };
}

// Senhas: bcrypt com sal automatico e custo configuravel. O banco guarda so o hash, nunca a senha.
async function hashPassword(password) {
  return bcrypt.hash(password, env.security.bcryptRounds);
}

// Hashes antigos (custo menor) sao refeitos no proximo login bem-sucedido.
function passwordNeedsRehash(hash) {
  try {
    return bcrypt.getRounds(hash) < env.security.bcryptRounds;
  } catch (error) {
    return true;
  }
}

async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

module.exports = {
  ApiError,
  asyncHandler,
  success,
  created,
  validateRequest,
  signToken,
  auth,
  hashPassword,
  comparePassword,
  passwordNeedsRehash,
  invalidateAuthCache
};
