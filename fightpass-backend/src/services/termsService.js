const db = require("../database/connection");
const { ApiError } = require("../lib/http");

const CURRENT_TERMS = {
  version: "terms_v3",
  title: "Termos de Uso e Política de Privacidade do FightPass",
  summary: "Leia com atenção. Ao aceitar, você declara estar ciente das condições de utilização da plataforma e do tratamento dos seus dados pessoais.",
  sections: [
    {
      title: "1. Aceitação dos termos",
      text: "Ao criar uma conta ou utilizar os serviços do FightPass, você concorda integralmente com estes Termos de Uso e com nossa Política de Privacidade. A plataforma FightPass consiste em um sistema integrado de gestão para academias de artes marciais, oferecendo serviços de controle de acesso, gestão de planos, processamento de pagamentos e análise de dados para otimização da experiência do usuário. Caso não concorde com qualquer disposição aqui estabelecida, recomenda-se que não utilize nossos serviços."
    },
    {
      title: "2. Coleta e uso de dados",
      text: "É coletado e processado diversos tipos de dados para fornecer nossos serviços. Entre as informações coletadas estão dados pessoais como nome completo, CPF, endereço, e-mail e telefone; autorização para utilização de determinadas modalidade e atividade física incluindo modalidades praticadas, frequência de treinos e histórico de academias visitadas; e dados técnicos como endereço IP e metadados de interação. Essas informações são utilizadas para gerenciar planos de assinatura, controlar acesso às academias, personalizar a experiência do usuário, gerar relatórios analíticos e melhorar continuamente nossa plataforma."
    },
    {
      title: "3. Compartilhamento e segurança",
      text: "Seus dados podem ser compartilhados exclusivamente para as finalidades estabelecidas: com academias parceiras para controle de acesso e segurança; com processadores de pagamento para transações financeiras; com prestadores de serviço para hospedagem e suporte técnico; e com autoridades competentes quando exigido por lei. Implementa-se medidas de segurança robustas incluindo criptografia TLS 1.2+ em todas as comunicações, armazenamento seguro em servidores cloud, controle rigoroso de acesso e auditorias regulares de segurança para proteger suas informações contra acessos não autorizados."
    },
    {
      title: "4. Direitos do usuário",
      text: "De acordo com a Lei Geral de Proteção de Dados (LGPD), você possui direitos específicos sobre seus dados pessoais. Estes incluem confirmar a existência de tratamento, acessar dados completos, corrigir informações inexatas, solicitar anonimização ou eliminação de dados, obter portabilidade para outro fornecedor, revogar consentimentos e ser informado sobre compartilhamentos. Para exercer esses direitos, entre em contato através do e-mail privacidade@FightPass.com.br. Os dados são mantidos por períodos específicos: dados cadastrais por 5 anos após encerramento da conta, dados financeiros por 10 anos por obrigação legal, e dados de atividade por 3 anos para análises."
    },
    {
      title: "5. Disposições gerais",
      text: "Estes termos podem ser atualizados periodicamente para refletir melhorias na plataforma ou mudanças regulatórias. Os usuários são notificados sobre alterações significativas através dos canais oficiais de comunicação. O uso continuado dos serviços após tais notificações implica na aceitação das novas condições. Para questões relacionadas a estes termos ou à privacidade, disponibiliza-se canais de atendimento especializados, incluindo e-mail, telefone e endereço físico, com horário de funcionamento de segunda a sexta-feira, das 9h às 18h."
    },
    {
      title: "6. Responsabilidades e obrigações",
      text: "O usuário é integralmente responsável pela veracidade das informações fornecidas durante o cadastro e para manter confidencialidade de seus dados de acesso. É estritamente proibida a utilização da plataforma para fins ilícitos, incluindo, mas não se limitando a prática de fraudes, falsificação ideológica ou qualquer tipo de atividade que viole direitos de terceiros. O FightPass se reserva o direito de suspender ou cancelar contas que descumprirem estes termos, sem prejuízo das medidas legais cabíveis."
    },
    {
      title: "7. Suporte e atendimento",
      text: "Para questões técnicas, dúvidas sobre funcionamento da plataforma ou problemas com acesso, é disponibilizado um canal de suporte especializado através do telefone (11) 4004-1234, com atendimento 24 horas para emergências relacionadas ao sistema. Para questões administrativas e jurídicas, o horário de atendimento é de segunda a sexta-feira das 9h às 18h, através do e-mail juridico@FightPass.com.br."
    },
    {
      title: "8. Propriedade intelectual",
      text: "Todo o conteúdo, funcionalidades e software que compõem a plataforma FightPass são de propriedade exclusiva da empresa, sendo protegidos pelas leis de propriedade intelectual e direitos autorais. É expressamente proibida a reprodução, distribuição ou utilização não autorizada de qualquer elemento da plataforma, sob pena de responsabilização civil e criminal."
    },
    {
      title: "9. Legislação aplicável",
      text: "Estes termos são regidos pelas leis da República Federativa do Brasil, especialmente pela Lei nº 13.709/2018 e pela Lei nº 8.078/1990 do Código de Defesa do Consumidor. Fica eleito o Foro da Comarca de São Paulo/SP para dirimir quaisquer questões oriundas destes termos, com expressa renúncia a qualquer outro, por mais privilegiado que seja."
    },
    {
      title: "10. Política de retenção de dados",
      text: "Seus dados pessoais são mantidos pelo tempo necessário para cumprir as finalidades para as quais foram coletados, respeitando os períodos mínimos estabelecidos por lei. Dados cadastrais são mantidos por 5 anos após o encerramento da conta; dados financeiros por 10 anos conforme exigência legal; registros de acesso por 6 meses; e dados de atividade por 3 anos para análises e melhorias do sistema. Após esses períodos, os dados são eliminados de forma segura ou anonimizados para fins estatísticos."
    },
    {
      title: "11. Cookies e tecnologias de rastreio",
      text: "Cookies são utilizados e tecnologias similares para melhorar a experiência do usuário, analisar o tráfego no site e personalizar conteúdo. Os cookies essenciais são necessários para o funcionamento da plataforma, enquanto cookies analíticos nos ajudam a entender como os usuários interagem com os serviços. Você pode gerenciar suas preferências de cookies através das configurações do seu navegador."
    },
    {
      title: "12. Comunicações de marketing",
      text: "Enviar comunicações sobre novidades, promoções e atualizações da plataforma podem ser enviadas para usuários que tenham consentido previamente com esse tipo de comunicação. É possível cancelar o recebimento dessas comunicações a qualquer momento através do link de descadastro presente em cada e-mail ou através das configurações da conta no aplicativo."
    },
    {
      title: "13. Alterações nos termos",
      text: "É reservado o direito de modificar estes Termos e Política de Privacidade a qualquer momento. Alterações significativas serão comunicadas com pelo menos 30 dias de antecedência através de notificação no aplicativo e por e-mail cadastrado. O uso continuado dos serviços após as alterações implica em aceitação das novas condições."
    },
    {
      title: "14. Resolução de conflitos",
      text: "Em caso de disputas relacionadas aos serviços, busca-se primariamente a solução através de meios extrajudiciais. Um canal de mediação digital é oferecido para resolução de conflitos, e em caso de insucesso, as partes podem recorrer ao Poder Judiciário nos termos do item 9 destes Termos."
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
