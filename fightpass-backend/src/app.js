const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const env = require("./config/env");
const routes = require("./routes");

const app = express();

// Atras do proxy do Render/Vercel: sem isso todos os usuarios pareceriam ter o mesmo IP e o limite de requisicoes pegaria todo mundo junto.
app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use(helmet({
  // API so devolve JSON: nada de embutir em frames nem carregar recursos de terceiros.
  contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
  crossOriginResourcePolicy: { policy: "cross-origin" },
  referrerPolicy: { policy: "no-referrer" }
}));

// CORS: so os sites listados em CORS_ORIGINS podem chamar a API pelo navegador.
// Em desenvolvimento, sem lista, aceita localhost.
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true); // curl, webhooks e chamadas servidor-a-servidor
    if (env.cors.origins.includes(origin)) return callback(null, true);
    if (!env.isProduction && LOCAL_ORIGIN.test(origin)) return callback(null, true);
    return callback(null, false);
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  maxAge: 600
}));

app.use(express.json({ limit: "2mb" }));
app.use(morgan(env.isProduction ? "combined" : "dev"));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false }));

// Limite mais apertado nas rotas sensiveis (login, cadastro, codigos e recuperacao de senha).
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.security.authRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Muitas tentativas. Aguarde alguns minutos e tente novamente.", details: null }
});
["/login", "/register", "/forgot-password", "/reset-password", "/verify-email", "/resend-verification"].forEach((route) => {
  app.use(`/api/auth${route}`, authLimiter);
});

app.use("/api", routes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Rota nao encontrada"
  });
});

app.use((err, req, res, next) => {
  // JSON malformado ou grande demais: erro do cliente, nao do servidor.
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ success: false, message: "JSON invalido", details: null });
  }
  if (err.type === "entity.too.large") {
    return res.status(413).json({ success: false, message: "Requisicao grande demais", details: null });
  }

  if (err.code === "ER_DUP_ENTRY") {
    const messageByKey = [
      { key: "users.email", message: "Ja existe um usuario com este email" },
      { key: "email", message: "Ja existe um usuario com este email" },
      { key: "users.document", message: "CPF/CNPJ ja cadastrado" },
      { key: "document", message: "CPF/CNPJ ja cadastrado" },
      { key: "institutions.legal_document", message: "Ja existe uma instituicao com este CNPJ" },
      { key: "legal_document", message: "Ja existe uma instituicao com este CNPJ" }
    ];
    const duplicateMessage = messageByKey.find((item) => err.message.includes(item.key));

    return res.status(409).json({
      success: false,
      message: duplicateMessage ? duplicateMessage.message : "Registro duplicado",
      details: null
    });
  }

  const status = err.statusCode || 500;
  if (status >= 500) console.error("[erro]", err);

  // Em producao nao vazamos detalhes internos (SQL, caminhos de arquivo) nas respostas de erro 500.
  res.status(status).json({
    success: false,
    message: status >= 500 && env.isProduction ? "Erro interno do servidor" : (err.message || "Erro interno do servidor"),
    details: status >= 500 && env.isProduction ? null : (err.details || null)
  });
});

module.exports = app;
