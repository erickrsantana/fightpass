const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { validationResult } = require("express-validator");
const env = require("../config/env");

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

function signToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email },
    env.jwt.secret,
    { expiresIn: env.jwt.expiresIn }
  );
}

function auth(requiredRoles = []) {
  return (req, res, next) => {
    const header = req.headers.authorization || "";
    const [, token] = header.split(" ");

    if (!token) {
      return next(new ApiError(401, "Nao autenticado"));
    }

    try {
      const payload = jwt.verify(token, env.jwt.secret);
      req.user = payload;

      if (requiredRoles.length > 0 && !requiredRoles.includes(payload.role)) {
        return next(new ApiError(403, "Acesso negado para este perfil"));
      }

      return next();
    } catch (error) {
      return next(new ApiError(401, "Token invalido ou expirado"));
    }
  };
}

async function hashPassword(password) {
  return bcrypt.hash(password, 10);
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
  comparePassword
};
