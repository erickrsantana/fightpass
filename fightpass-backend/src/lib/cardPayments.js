const crypto = require("crypto");
const { ApiError } = require("./http");

const MAX_INSTALLMENTS = 3;
const PIX_TTL_MINUTES = 30;
const BOLETO_TTL_DAYS = 3;
// Cartao de teste: este numero sempre e recusado (para demonstrar o pagamento recusado).
const DECLINED_TEST_CARD = "4000000000000002";

function luhnValid(number) {
  let sum = 0;
  let double = false;
  for (let i = number.length - 1; i >= 0; i -= 1) {
    let digit = Number(number[i]);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

function detectBrand(number) {
  if (/^4/.test(number)) return "Visa";
  if (/^(5[1-5]|2[2-7])/.test(number)) return "Mastercard";
  if (/^3[47]/.test(number)) return "Amex";
  if (/^(4011|4312|4389|4514|4576|5041|5066|5067|509|6277|6362|6363|650|6516|6550)/.test(number)) return "Elo";
  if (/^(606282|3841)/.test(number)) return "Hipercard";
  return "Cartao";
}

// Valida o cartao (simulado). O numero completo e o CVV nunca sao guardados.
function validateCard(card) {
  const number = String(card && card.number || "").replace(/\D/g, "");
  const holder = String(card && card.holder || "").trim();
  const expiry = String(card && card.expiry || "").replace(/\D/g, "");
  const cvv = String(card && card.cvv || "").replace(/\D/g, "");

  if (number.length < 13 || number.length > 19 || !luhnValid(number)) {
    throw new ApiError(422, "Numero do cartao invalido");
  }
  if (holder.length < 3) throw new ApiError(422, "Informe o nome impresso no cartao");
  if (expiry.length !== 4) throw new ApiError(422, "Validade invalida. Use MM/AA");
  const month = Number(expiry.slice(0, 2));
  const year = 2000 + Number(expiry.slice(2));
  const now = new Date();
  if (month < 1 || month > 12 || year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1)) {
    throw new ApiError(422, "Cartao vencido ou validade invalida");
  }
  if (cvv.length < 3 || cvv.length > 4) throw new ApiError(422, "CVV invalido");
  if (number === DECLINED_TEST_CARD) {
    throw new ApiError(402, "Pagamento recusado pelo emissor do cartao (simulacao). Tente outro cartao.");
  }
  return { brand: detectBrand(number), last4: number.slice(-4) };
}

function makeReceiptCode(paymentId) {
  const now = new Date();
  const day = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  return `FP-${day}-${String(paymentId).padStart(6, "0")}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
}

module.exports = {
  MAX_INSTALLMENTS,
  PIX_TTL_MINUTES,
  BOLETO_TTL_DAYS,
  luhnValid,
  detectBrand,
  validateCard,
  makeReceiptCode
};
