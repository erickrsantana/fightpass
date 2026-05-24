const db = require("../database/connection");
const { ApiError } = require("../lib/http");

const CURRENT_TERMS = {
  version: "terms_v1",
  title: "Termos de Uso FightPass",
  summary: "Para continuar, confirme que leu e aceita as regras de uso da plataforma.",
  sections: [
    {
      title: "Uso da plataforma",
      text: "O FightPass organiza acesso a aulas, planos e dados de treino para fins academicos e demonstrativos."
    },
    {
      title: "Cadastro e pagamentos",
      text: "O usuario declara que as informacoes fornecidas sao verdadeiras e entende que pagamentos deste prototipo sao ficticios."
    },
    {
      title: "Responsabilidade",
      text: "O usuario deve seguir as regras da instituicao escolhida e manter suas credenciais de acesso em seguranca."
    }
  ]
};

const ACCEPTANCE_ORIGINS = new Set(["cadastro", "contratacao_plano"]);

function isAccepted(value) {
  return value === true || value === "true" || value === "on" || value === "1" || value === 1;
}

function getCurrentTerms() {
  return CURRENT_TERMS;
}

function assertValidOrigin(origin) {
  if (!ACCEPTANCE_ORIGINS.has(origin)) {
    throw new ApiError(422, "Origem de aceite dos termos invalida");
  }
}

function assertTermsAccepted({ accepted, version }) {
  if (!isAccepted(accepted)) {
    throw new ApiError(422, "Aceite dos Termos de Uso obrigatorio para continuar");
  }

  if (version !== CURRENT_TERMS.version) {
    throw new ApiError(422, "Versao dos Termos de Uso invalida ou desatualizada");
  }
}

async function recordTermsAcceptance({
  userId,
  version,
  origin,
  ipAddress = null,
  userAgent = null
}, connection = null) {
  assertValidOrigin(origin);

  if (!userId) {
    throw new ApiError(422, "Usuario obrigatorio para registrar aceite dos termos");
  }

  const executor = connection || db.pool;
  const [result] = await executor.execute(
    `INSERT INTO terms_acceptances
       (user_id, terms_version, origin, ip_address, user_agent, accepted_at)
     VALUES (?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       accepted_at = VALUES(accepted_at),
       ip_address = VALUES(ip_address),
       user_agent = VALUES(user_agent)`,
    [userId, version, origin, ipAddress, userAgent ? String(userAgent).slice(0, 255) : null]
  );

  if (result.insertId) {
    return {
      id: result.insertId,
      userId,
      version,
      origin
    };
  }

  const rows = await db.query(
    `SELECT id, user_id, terms_version, origin, accepted_at
     FROM terms_acceptances
     WHERE user_id = ? AND terms_version = ? AND origin = ?
     LIMIT 1`,
    [userId, version, origin]
  );

  return rows[0] || {
    id: null,
    userId,
    version,
    origin
  };
}

async function ensureTermsAccepted(payload, connection = null) {
  assertTermsAccepted({
    accepted: payload.accepted,
    version: payload.version
  });

  return recordTermsAcceptance(payload, connection);
}

module.exports = {
  getCurrentTerms,
  assertTermsAccepted,
  recordTermsAcceptance,
  ensureTermsAccepted
};
