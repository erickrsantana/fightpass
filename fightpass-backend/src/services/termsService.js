const db = require("../database/connection");
const { ApiError } = require("../lib/http");

const CURRENT_TERMS = {
  version: "terms_v2",
  title: "Termos de Uso do FightPass",
  summary: "Leia com atenção. Ao aceitar, você declara estar ciente das condições de utilização da plataforma.",
  sections: [
    {
      title: "1. Objeto e finalidade",
      text: "O FightPass é uma plataforma que conecta alunos a academias e instituições parceiras de artes marciais e atividades físicas, permitindo localizar instituições, agendar aulas, acompanhar a frequência e gerenciar planos de acesso."
    },
    {
      title: "2. Cadastro e conta de acesso",
      text: "O usuário compromete-se a fornecer informações verdadeiras, completas e atualizadas. As credenciais de acesso são pessoais e intransferíveis, e o usuário responde por todas as atividades realizadas com a sua conta, devendo comunicar imediatamente qualquer uso não autorizado."
    },
    {
      title: "3. Planos e pagamentos",
      text: "O acesso às aulas depende do plano contratado, cujos valores, benefícios e validade são informados no momento da contratação. Nesta versão de demonstração da plataforma, os pagamentos são simulados e não geram cobrança real."
    },
    {
      title: "4. Agendamentos, cancelamentos e presença",
      text: "Os agendamentos estão sujeitos à disponibilidade de vagas e às regras de cada instituição. O aluno deve comparecer no horário reservado ou cancelar com antecedência. Ausências sem aviso podem ser registradas no histórico de frequência."
    },
    {
      title: "5. Responsabilidade das instituições",
      text: "As instituições são responsáveis pelas informações que cadastram (horários, vagas, modalidades e endereço), pela condução das aulas, pela qualificação de seus instrutores e pela segurança do ambiente de treino. O FightPass não presta serviços de treinamento."
    },
    {
      title: "6. Saúde e segurança",
      text: "A prática de artes marciais e atividades físicas envolve riscos. O aluno declara possuir condições de saúde compatíveis com a atividade, recomenda-se avaliação médica prévia, e deve seguir as orientações dos instrutores durante as aulas."
    },
    {
      title: "7. Privacidade e proteção de dados",
      text: "Os dados pessoais são tratados para viabilizar o funcionamento da plataforma, em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018). As informações necessárias à prestação do serviço são compartilhadas somente com a instituição vinculada. O titular pode solicitar acesso, correção ou exclusão de seus dados."
    },
    {
      title: "8. Condutas não permitidas",
      text: "É vedado fornecer informações falsas, tentar acessar contas ou dados de outros usuários ou instituições, burlar regras de agendamento ou de presença, e praticar condutas ofensivas ou discriminatórias na plataforma."
    },
    {
      title: "9. Alterações destes termos",
      text: "Estes termos podem ser atualizados a qualquer momento. Havendo alteração relevante, será solicitado novo aceite. A continuidade de uso da plataforma após a atualização indica ciência das novas condições."
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

async function findCurrentAcceptance(userId, connection = null) {
  const executor = connection || db.pool;
  const [rows] = await executor.execute(
    `SELECT id, user_id, terms_version, origin, accepted_at
     FROM terms_acceptances
     WHERE user_id = ? AND terms_version = ?
     ORDER BY accepted_at DESC, id DESC
     LIMIT 1`,
    [userId, CURRENT_TERMS.version]
  );
  return rows[0] || null;
}

async function ensureTermsAccepted(payload, connection = null) {
  // Se o usuario ja aceitou a versao atual (ex.: no primeiro acesso), nao exige aceitar de novo.
  if (payload.userId) {
    const existing = await findCurrentAcceptance(payload.userId, connection);
    if (existing) return existing;
  }

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
  ensureTermsAccepted,
  findCurrentAcceptance
};