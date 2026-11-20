// Funcoes de seguranca sem dependencias externas (podem ser testadas isoladamente).
const crypto = require("crypto");

// Comparacao em tempo constante (evita descobrir um valor pelo tempo de resposta).
function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

// Codigo numerico de N digitos com gerador criptografico (nao usa Math.random).
function generateNumericCode(digits = 6) {
  return String(crypto.randomInt(0, 10 ** digits)).padStart(digits, "0");
}

// O codigo de 6 digitos nunca e salvo puro: guardamos um HMAC amarrado ao usuario.
function hashVerificationCode(code, userId, secret) {
  return crypto.createHmac("sha256", String(secret)).update(`${userId}:${code}`).digest("hex");
}

// Bloqueio de forca bruta por e-mail + IP: apos N falhas seguidas, bloqueia por X minutos.
function createLoginThrottle({ maxAttempts = 5, lockMinutes = 15, now = () => Date.now() } = {}) {
  const entries = new Map();
  const lockMs = lockMinutes * 60 * 1000;

  function keyOf(email, ip) {
    return `${String(email || "").toLowerCase()}|${ip || ""}`;
  }

  function cleanup() {
    const current = now();
    for (const [key, entry] of entries) {
      if (entry.lockedUntil && entry.lockedUntil < current) entries.delete(key);
      else if (!entry.lockedUntil && current - entry.firstAt > lockMs) entries.delete(key);
    }
  }

  return {
    // Retorna quantos segundos faltam para liberar (0 = liberado).
    check(email, ip) {
      const entry = entries.get(keyOf(email, ip));
      if (!entry || !entry.lockedUntil) return 0;
      const remaining = entry.lockedUntil - now();
      return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
    },
    fail(email, ip) {
      if (entries.size > 5000) cleanup();
      const key = keyOf(email, ip);
      const current = now();
      let entry = entries.get(key);
      if (!entry || (entry.lockedUntil && entry.lockedUntil < current) || (!entry.lockedUntil && current - entry.firstAt > lockMs)) {
        entry = { count: 0, firstAt: current, lockedUntil: 0 };
      }
      entry.count += 1;
      if (entry.count >= maxAttempts) entry.lockedUntil = current + lockMs;
      entries.set(key, entry);
      return entry;
    },
    success(email, ip) {
      entries.delete(keyOf(email, ip));
    }
  };
}

// Valida a assinatura do webhook do Mercado Pago (header x-signature = "ts=...,v1=...").
function verifyMercadoPagoSignature({ signatureHeader, requestId, dataId, secret }) {
  if (!signatureHeader || !secret) return false;
  const parts = Object.fromEntries(
    String(signatureHeader).split(",").map((piece) => {
      const [k, ...v] = piece.split("=");
      return [String(k).trim(), v.join("=").trim()];
    })
  );
  if (!parts.ts || !parts.v1) return false;
  const manifest = `id:${String(dataId || "").toLowerCase()};request-id:${requestId || ""};ts:${parts.ts};`;
  const expected = crypto.createHmac("sha256", secret).update(manifest).digest("hex");
  return safeEqual(expected, parts.v1);
}

module.exports = {
  safeEqual,
  generateNumericCode,
  hashVerificationCode,
  createLoginThrottle,
  verifyMercadoPagoSignature
};
