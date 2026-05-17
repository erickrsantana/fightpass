const dotenv = require("dotenv");

dotenv.config();

module.exports = {
  appName: process.env.APP_NAME || "FightPass API",
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 3000),
  appUrl: process.env.APP_URL || "http://localhost:3000",
  db: {
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    name: process.env.DB_NAME || "fightpass",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || ""
  },
  jwt: {
    secret: process.env.JWT_SECRET || "change-this-secret",
    expiresIn: process.env.JWT_EXPIRES_IN || "8h"
  },
  email: {
    smtpHost: process.env.SMTP_HOST || "smtp-relay.brevo.com",
    smtpPort: Number(process.env.SMTP_PORT || 587),
    smtpSecure: String(process.env.SMTP_SECURE || "false").toLowerCase() === "true",
    smtpUser: process.env.SMTP_USER || "",
    smtpPass: process.env.SMTP_PASS || "",
    from: process.env.EMAIL_FROM || "FightPass <seu-email@exemplo.com>",
    passwordResetUrl: process.env.PASSWORD_RESET_URL || "http://127.0.0.1:5500/fightpass-frontend/redefinir-senha.html"
  },
  location: {
    googleGeocodingApiKey: process.env.GOOGLE_GEOCODING_API_KEY || "",
    openStreetMapGeocodingUrl: process.env.OPENSTREETMAP_GEOCODING_URL || "https://nominatim.openstreetmap.org/search",
    geocodingTimeoutMs: Number(process.env.GEOCODING_TIMEOUT_MS || 5000)
  },
  checkinTokenTtlSeconds: Number(process.env.CHECKIN_TOKEN_TTL_SECONDS || 45),
  bookingCancellationLimitHours: Number(process.env.BOOKING_CANCELLATION_LIMIT_HOURS || 2)
};
