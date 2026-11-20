const env = require("../config/env");
const { ApiError } = require("./http");

const VERIFY_URL = "https://api.hcaptcha.com/siteverify";

// Confere o token do hCaptcha com o servidor do hCaptcha (validar so no navegador nao protege nada).
async function verifyCaptchaToken(token, ip) {
  if (!token || typeof token !== "string" || token.length > 4096) return false;
  const params = new URLSearchParams({ secret: env.captcha.secret, response: token, sitekey: env.captcha.siteKey });
  if (ip) params.set("remoteip", ip);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
      signal: controller.signal
    });
    const data = await res.json();
    return data.success === true;
  } catch (error) {
    throw new ApiError(503, "Nao foi possivel validar o captcha agora. Tente novamente.");
  } finally {
    clearTimeout(timer);
  }
}

// Middleware: exige captcha valido quando o hCaptcha esta configurado. Sem chaves (ex.: dev), nao bloqueia.
async function captchaGuard(req, res, next) {
  try {
    if (!env.captcha.enabled) return next();
    const ok = await verifyCaptchaToken(req.body && req.body.captchaToken, req.ip);
    if (!ok) throw new ApiError(400, "Confirme que voce nao e um robo e tente novamente.", { code: "CAPTCHA_FAILED" });
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = { verifyCaptchaToken, captchaGuard };
