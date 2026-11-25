// Integracao com o Mercado Pago (Checkout Pro). O dinheiro vai para a conta dona do MERCADOPAGO_ACCESS_TOKEN.
// O cliente digita cartao/Pix na pagina do Mercado Pago: dados de cartao NUNCA passam pelo nosso servidor.
const env = require("../config/env");
const { ApiError } = require("./http");

const API_BASE = "https://api.mercadopago.com";

function isConfigured() {
  return Boolean(env.payments.mercadoPagoAccessToken);
}

function isGatewayMode() {
  return env.payments.mode === "gateway";
}

function assertConfigured() {
  if (!isConfigured()) {
    throw new ApiError(503, "Pagamento online indisponível: gateway não configurado");
  }
}

async function mpRequest(path, { method = "GET", body, idempotencyKey } = {}) {
  assertConfigured();
  const headers = {
    Authorization: `Bearer ${env.payments.mercadoPagoAccessToken}`,
    "Content-Type": "application/json"
  };
  if (idempotencyKey) headers["X-Idempotency-Key"] = idempotencyKey;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("[mercadopago] erro", response.status, JSON.stringify(payload).slice(0, 500));
      throw new ApiError(502, "O Mercado Pago recusou a solicitação. Tente novamente em instantes.");
    }
    return payload;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error("[mercadopago] falha de rede:", error.message);
    throw new ApiError(502, "Não foi possível falar com o Mercado Pago agora. Tente novamente em instantes.");
  } finally {
    clearTimeout(timer);
  }
}

// Cria a preferencia de pagamento. external_reference liga o pagamento do gateway a nossa cobranca ("S-12" aluno, "D-7" DOJO).
async function createPreference({ title, amountCents, externalReference, payerEmail, backPath }) {
  const frontend = env.frontendUrl;
  const returnUrl = `${frontend}/${backPath}`;
  const preference = await mpRequest("/checkout/preferences", {
    method: "POST",
    idempotencyKey: `fightpass-${externalReference}`,
    body: {
      items: [{
        id: externalReference,
        title: String(title).slice(0, 120),
        quantity: 1,
        currency_id: "BRL",
        unit_price: Number((amountCents / 100).toFixed(2))
      }],
      payer: payerEmail ? { email: payerEmail } : undefined,
      external_reference: externalReference,
      notification_url: `${env.payments.apiPublicUrl}/api/payments/webhook/mercadopago`,
      back_urls: {
        success: `${returnUrl}?gateway=success`,
        pending: `${returnUrl}?gateway=pending`,
        failure: `${returnUrl}?gateway=failure`
      },
      auto_return: "approved",
      statement_descriptor: "FIGHTPASS"
    }
  });

  const isTest = env.payments.mercadoPagoAccessToken.startsWith("TEST-");
  return {
    preferenceId: preference.id,
    checkoutUrl: isTest && preference.sandbox_init_point ? preference.sandbox_init_point : preference.init_point
  };
}

// Sempre confirmamos o pagamento consultando a API do Mercado Pago (nunca confiamos so no corpo do webhook).
async function getPayment(paymentId) {
  if (!/^\d{1,20}$/.test(String(paymentId))) throw new ApiError(400, "Identificador de pagamento inválido");
  return mpRequest(`/v1/payments/${paymentId}`);
}

module.exports = {
  isConfigured,
  isGatewayMode,
  createPreference,
  getPayment
};
