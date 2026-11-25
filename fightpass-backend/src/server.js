const app = require("./app");
const env = require("./config/env");
const { emailProvider } = require("./lib/email");

if (env.isProduction) {
  if (!env.cors.origins.length) console.warn("[segurança] CORS_ORIGINS vazio: nenhuma origem de navegador será aceita.");
  if (env.payments.mode === "gateway" && !env.payments.mercadoPagoWebhookSecret) {
    console.warn("[segurança] MERCADOPAGO_WEBHOOK_SECRET ausente: webhooks serão recusados.");
  }
  if (env.emailVerification.loginCodeRequired && !emailProvider()) {
    console.warn("[segurança] Código por e-mail a cada login ATIVO, mas nenhum provedor de e-mail configurado (BREVO_API_KEY): ninguém conseguirá entrar. Configure o Brevo ou defina LOGIN_2FA_REQUIRED=false.");
  }
  if (!env.captcha.enabled) console.warn("[segurança] hCaptcha desligado (HCAPTCHA_SITEKEY/HCAPTCHA_SECRET ausentes).");
  if (env.payments.mode !== "gateway") console.warn("[pagamentos] PAYMENTS_MODE != gateway: pagamentos SIMULADOS ativos.");
}

const FICTITIOUS_INSTITUTIONS = [
  "Dojo Jurubatuba",
  "Tatame Chácara Santo Antônio",
  "Campo Belo Fight Club",
  "Centro de Lutas Interlagos"
];

require("./database/connection")
  .query(
    `UPDATE institutions
     SET name = CONCAT(name, ' (fictícia)')
     WHERE name IN (${FICTITIOUS_INSTITUTIONS.map(() => "?").join(", ")})`,
    FICTITIOUS_INSTITUTIONS
  )
  .catch((error) => console.warn("[instituições] não foi possível marcar academias fictícias:", error.message));

app.listen(env.port, () => {
  console.log(`${env.appName} executando em ${env.appUrl}`);
  console.log(`[email] provedor: ${emailProvider() || "NENHUM (códigos aparecem só neste terminal)"}`);
});
