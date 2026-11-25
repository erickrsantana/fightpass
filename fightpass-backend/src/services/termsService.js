const db = require("../database/connection");
const { ApiError } = require("../lib/http");

const CURRENT_TERMS = {
  version: "terms_v4",
  title: "Termos de Uso e Política de Privacidade do FightPass",
  summary: "Leia com atenção. Ao aceitar, você declara estar ciente das condições de utilização da plataforma e do tratamento dos seus dados pessoais.",
  sections: [
    {
      title: "1. Aceitação e objeto",
      text: "Ao criar uma conta ou utilizar o FightPass, você declara ter lido e concordado com estes Termos de Uso e com a Política de Privacidade. O FightPass é uma plataforma que conecta alunos a academias e instituições parceiras de artes marciais, permitindo localizar academias, agendar aulas, registrar presença e gerenciar planos, e oferece às academias ferramentas para gerir turmas, alunos, avaliações e repasses. Esta versão foi desenvolvida como projeto acadêmico de conclusão de curso, com fins demonstrativos. Caso não concorde com alguma disposição, não utilize o serviço."
    },
    {
      title: "2. Cadastro e conta de acesso",
      text: "O usuário deve fornecer informações verdadeiras, completas e atualizadas. O cadastro público é destinado a alunos; os perfis de instrutor e de administrador são liberados pela própria instituição, e as academias se cadastram em tela específica. A senha deve ter no mínimo oito caracteres, com ao menos uma letra maiúscula e um número, e as credenciais são pessoais e intransferíveis. A cada acesso, o sistema envia um código de 6 números ao e-mail da conta, válido por 15 minutos, e utiliza o serviço hCaptcha para distinguir pessoas de programas automáticos. O usuário responde por todas as atividades realizadas com a sua conta e deve comunicar imediatamente qualquer uso não autorizado. O plano de teste de um dia é limitado a um por CPF."
    },
    {
      title: "3. Planos e pagamentos",
      text: "O acesso às aulas depende do plano contratado, cujos valores, benefícios e validade de 30 dias são informados no momento da contratação. Trocar de plano enquanto o atual está em uso gera uma multa equivalente a 20% do valor do plano atual, informada antes da confirmação. As academias parceiras pagam uma mensalidade (Plano DOJO) para disponibilizar e gerenciar aulas e, enquanto ela estiver vencida ou pendente, não podem cadastrar nem gerenciar aulas. Nesta versão de demonstração, os pagamentos por Pix, boleto, cartão e transferência são simulados e não geram cobrança real."
    },
    {
      title: "4. Agendamentos, cancelamentos e presença",
      text: "Os agendamentos dependem de plano ativo com treinos disponíveis e de vagas na turma. O cancelamento deve ser feito com pelo menos duas horas de antecedência, caso em que o treino é devolvido ao saldo do plano. A presença é registrada por QR Code de uso único, válido por 45 segundos, ou manualmente pelo instrutor ou pelo gestor. Ausências sem aviso podem constar no histórico de frequência."
    },
    {
      title: "5. Responsabilidade das instituições",
      text: "As instituições são responsáveis pelas informações que cadastram (horários, vagas, modalidades e endereço), pela condução das aulas, pela qualificação de seus instrutores e pela segurança do ambiente de treino. O FightPass não presta serviços de treinamento."
    },
    {
      title: "6. Saúde e segurança",
      text: "A prática de artes marciais e de atividades físicas envolve riscos. O aluno declara possuir condições de saúde compatíveis com a atividade, recomenda-se avaliação médica prévia, e as orientações dos instrutores devem ser seguidas durante as aulas."
    },
    {
      title: "7. Coleta e uso de dados",
      text: "São tratados dados pessoais como nome completo, e-mail, CPF ou CNPJ, telefone, gênero e foto de perfil (quando informada); dados das academias, como nome, endereço e modalidades; dados de uso da plataforma, como agendamentos, presenças, avaliações, planos e pagamentos simulados; e dados técnicos, como endereço IP e navegador, registrados no momento do aceite dos termos. Essas informações são utilizadas para criar e proteger a conta, localizar academias no mapa, gerenciar planos, controlar acesso e presença, gerar indicadores e repasses e melhorar a plataforma. O e-mail é usado apenas para mensagens do serviço, como códigos de acesso e redefinição de senha, e não para publicidade."
    },
    {
      title: "8. Compartilhamento e segurança",
      text: "Os dados são compartilhados somente para as finalidades da plataforma: com a academia vinculada ao aluno, para controle de acesso e acompanhamento; com os serviços de hospedagem, banco de dados e envio de e-mail que operam a plataforma; com o serviço hCaptcha, para a verificação de acesso; com o serviço ViaCEP, para completar endereços; e com autoridades competentes, quando exigido por lei. Os dados pessoais não são vendidos. A plataforma adota senhas armazenadas de forma criptografada, comunicação protegida por HTTPS, autenticação com código enviado por e-mail, controle de acesso por perfil e sessões com validade limitada."
    },
    {
      title: "9. Direitos do titular",
      text: "De acordo com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018), o titular pode confirmar a existência de tratamento, acessar seus dados, corrigir informações inexatas, solicitar anonimização ou eliminação, obter portabilidade, revogar consentimentos e ser informado sobre os compartilhamentos. Para exercer esses direitos, utilize a página “Ajuda”, disponível no menu da própria plataforma após o login."
    },
    {
      title: "10. Retenção de dados",
      text: "Os dados pessoais são mantidos pelo tempo necessário para cumprir as finalidades para as quais foram coletados, respeitados os prazos legais. Dados cadastrais são mantidos por 5 anos após o encerramento da conta; dados financeiros, por 10 anos; registros de acesso, por 6 meses; e dados de atividade, por 3 anos. Após esses períodos, os dados são eliminados de forma segura ou anonimizados."
    },
    {
      title: "11. Cookies e armazenamento local",
      text: "A plataforma utiliza o armazenamento do próprio navegador para manter a sessão do usuário e guardar preferências, como as escolhas da Central de Acessibilidade. O serviço hCaptcha pode utilizar tecnologias próprias para a verificação. A plataforma não utiliza cookies para publicidade. O usuário pode apagar esses dados nas configurações do navegador, o que encerra a sessão e restaura as preferências."
    },
    {
      title: "12. Condutas e responsabilidades do usuário",
      text: "É vedado fornecer informações falsas, tentar acessar contas ou dados de outros usuários ou instituições, burlar as regras de agendamento ou de presença, praticar fraudes, usar a plataforma para fins ilícitos ou praticar condutas ofensivas ou discriminatórias. O FightPass pode suspender ou cancelar contas que descumprirem estes termos, sem prejuízo das medidas legais cabíveis."
    },
    {
      title: "13. Propriedade intelectual",
      text: "Todo o conteúdo, as funcionalidades e o software que compõem o FightPass são protegidos pelas leis de propriedade intelectual e direitos autorais. É proibida a reprodução, a distribuição ou a utilização não autorizada de qualquer elemento da plataforma."
    },
    {
      title: "14. Alterações destes termos",
      text: "Estes termos podem ser atualizados a qualquer momento. Havendo alteração relevante, será solicitado novo aceite no acesso seguinte. A continuidade de uso da plataforma após a atualização indica ciência das novas condições."
    },
    {
      title: "15. Suporte e resolução de conflitos",
      text: "Para dúvidas, problemas de acesso ou reclamações, o usuário pode utilizar as páginas “Ajuda” e “Reclame aqui”, disponíveis no menu da própria plataforma após o login. Em caso de disputa, busca-se primeiro a solução por meios extrajudiciais, e, sem sucesso, as partes podem recorrer ao Poder Judiciário nos termos do item 16."
    },
    {
      title: "16. Legislação aplicável e foro",
      text: "Estes termos são regidos pelas leis da República Federativa do Brasil, especialmente pela Lei nº 13.709/2018 e pela Lei nº 8.078/1990 (Código de Defesa do Consumidor). Fica eleito o foro da Comarca de São Paulo/SP para dirimir quaisquer questões oriundas destes termos."
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
