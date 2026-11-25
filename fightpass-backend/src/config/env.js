const dotenv = require("dotenv");

dotenv.config();

function parseDatabaseUrl(value) {
  if (!value) return {};

  try {
    const url = new URL(value);

    return {
      host: url.hostname,
      port: url.port ? Number(url.port) : undefined,
      name: url.pathname ? decodeURIComponent(url.pathname.replace(/^\//, "")) : undefined,
      user: url.username ? decodeURIComponent(url.username) : undefined,
      password: url.password ? decodeURIComponent(url.password) : undefined
    };
  } catch (error) {
    return {};
  }
}

const railwayMysqlUrl = parseDatabaseUrl(process.env.MYSQL_URL || process.env.DATABASE_URL);

const nodeEnv = process.env.NODE_ENV || "development";
const isProduction = nodeEnv === "production";
const DEFAULT_JWT_SECRET = "change-this-secret";
const jwtSecret = process.env.JWT_SECRET || DEFAULT_JWT_SECRET;

// Em producao, recusa subir com segredo fraco: quem conhece o segredo padrao consegue forjar tokens de qualquer usuario.
if (isProduction && (jwtSecret === DEFAULT_JWT_SECRET || jwtSecret.length < 32)) {
  throw new Error("JWT_SECRET ausente ou fraco. Defina um segredo aleatório de pelo menos 32 caracteres (ex.: openssl rand -hex 48).");
}

function parseList(value) {
  return String(value || "").split(",").map((item) => item.trim().replace(/\/+$/, "")).filter(Boolean);
}

module.exports = {
  isProduction,
  appName: process.env.APP_NAME || "FightPass API",
  nodeEnv,
  port: Number(process.env.PORT || 3000),
  appUrl: process.env.APP_URL || "http://localhost:3000",
  db: {
    host: process.env.MYSQLHOST || railwayMysqlUrl.host || process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.MYSQLPORT || railwayMysqlUrl.port || process.env.DB_PORT || 3306),
    name: process.env.MYSQLDATABASE || railwayMysqlUrl.name || process.env.DB_NAME || "fightpass",
    user: process.env.MYSQLUSER || railwayMysqlUrl.user || process.env.DB_USER || "root",
    password: process.env.MYSQLPASSWORD || railwayMysqlUrl.password || process.env.DB_PASSWORD || ""
  },
  jwt: {
    secret: jwtSecret,
    expiresIn: process.env.JWT_EXPIRES_IN || "8h"
  },
  email: {
    // Brevo via API HTTPS (porta 443): funciona no Render gratis, que bloqueia SMTP (portas 25/465/587).
    brevoApiKey: process.env.BREVO_API_KEY || "",
    smtpHost: process.env.SMTP_HOST || "smtp-relay.brevo.com",
    smtpPort: Number(process.env.SMTP_PORT || 587),
    smtpSecure: String(process.env.SMTP_SECURE || "false").toLowerCase() === "true",
    smtpUser: process.env.SMTP_USER || "",
    smtpPass: process.env.SMTP_PASS || "",
    from: process.env.EMAIL_FROM || "FightPass <seu-email@exemplo.com>",
    passwordResetUrl: process.env.PASSWORD_RESET_URL || "http://localhost:5500/redefinir-senha.html"
  },
  location: {
    googleGeocodingApiKey: process.env.GOOGLE_GEOCODING_API_KEY || "",
    openStreetMapGeocodingUrl: process.env.OPENSTREETMAP_GEOCODING_URL || "https://nominatim.openstreetmap.org/search",
    geocodingTimeoutMs: Number(process.env.GEOCODING_TIMEOUT_MS || 5000)
  },
  // Origens (sites) autorizadas a chamar a API pelo navegador. Ex.: https://fightpass.vercel.app
  cors: {
    origins: parseList(process.env.CORS_ORIGINS)
  },
  frontendUrl: (process.env.FRONTEND_URL || "http://localhost:5500").replace(/\/+$/, ""),
  security: {
    bcryptRounds: Number(process.env.BCRYPT_ROUNDS || 12),
    loginMaxAttempts: Number(process.env.LOGIN_MAX_ATTEMPTS || 5),
    loginLockMinutes: Number(process.env.LOGIN_LOCK_MINUTES || 15),
    authRateLimitMax: Number(process.env.AUTH_RATE_LIMIT_MAX || 20)
  },
  emailVerification: {
    // Codigo por e-mail A CADA LOGIN (2o fator), inclusive para contas antigas.
    loginCodeRequired: String(process.env.LOGIN_2FA_REQUIRED || "true").toLowerCase() !== "false",
    required: String(process.env.EMAIL_VERIFICATION_REQUIRED || "true").toLowerCase() !== "false",
    ttlMinutes: Number(process.env.EMAIL_VERIFICATION_TTL_MINUTES || 15),
    maxAttempts: Number(process.env.EMAIL_VERIFICATION_MAX_ATTEMPTS || 5),
    resendCooldownSeconds: Number(process.env.EMAIL_VERIFICATION_RESEND_SECONDS || 60)
  },
  payments: {
    // "simulation" = fluxo ficticio do TCC; "gateway" = cobranca real pelo Mercado Pago.
    mode: String(process.env.PAYMENTS_MODE || "simulation").toLowerCase() === "gateway" ? "gateway" : "simulation",
    mercadoPagoAccessToken: process.env.MERCADOPAGO_ACCESS_TOKEN || "",
    mercadoPagoWebhookSecret: process.env.MERCADOPAGO_WEBHOOK_SECRET || "",
    // URL publica da API (o Mercado Pago chama o webhook nela). Ex.: https://fightpass-api.onrender.com
    apiPublicUrl: (process.env.API_PUBLIC_URL || process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "")
  },
  // hCaptcha: ativo quando HCAPTCHA_SECRET existe (a chave publica vai para o navegador, a secreta fica so aqui).
  captcha: {
    siteKey: process.env.HCAPTCHA_SITEKEY || "",
    secret: process.env.HCAPTCHA_SECRET || "",
    get enabled() { return Boolean(this.secret && this.siteKey); }
  },
  checkinTokenTtlSeconds: Number(process.env.CHECKIN_TOKEN_TTL_SECONDS || 45),
  bookingCancellationLimitHours: Number(process.env.BOOKING_CANCELLATION_LIMIT_HOURS || 2)
};
