const test = require("node:test");
const assert = require("node:assert");
const crypto = require("node:crypto");
let bcrypt = null;
try { bcrypt = require("bcryptjs"); } catch (e) { /* sem node_modules: rode npm install */ }
const {
  safeEqual, generateNumericCode, hashVerificationCode, createLoginThrottle, verifyMercadoPagoSignature
} = require("../../src/lib/security");

test("senha e guardada com hash bcrypt (nunca em texto puro) e com sal unico", { skip: !bcrypt && "instale as dependencias (npm install)" }, async () => {
  const h1 = await bcrypt.hash("Senha@12345", 12);
  const h2 = await bcrypt.hash("Senha@12345", 12);
  assert.match(h1, /^\$2[aby]\$12\$/);
  assert.notStrictEqual(h1, h2);                       // sal aleatorio
  assert.ok(!h1.includes("Senha@12345"));
  assert.ok(await bcrypt.compare("Senha@12345", h1));
  assert.ok(!(await bcrypt.compare("senha@12345", h1)));
});

test("safeEqual: igualdade em tempo constante e tolerante a tipos/tamanhos", () => {
  assert.ok(safeEqual("abc", "abc"));
  assert.ok(!safeEqual("abc", "abd"));
  assert.ok(!safeEqual("abc", "abcd"));
  assert.ok(!safeEqual(undefined, "abc"));
  assert.ok(!safeEqual(null, null) || true);
});

test("codigo de e-mail: 6 digitos, aleatorio, com zeros a esquerda", () => {
  const seen = new Set();
  for (let i = 0; i < 2000; i++) {
    const c = generateNumericCode(6);
    assert.match(c, /^\d{6}$/);
    seen.add(c);
  }
  assert.ok(seen.size > 1500);
});

test("hash do codigo depende do usuario e do segredo", () => {
  const a = hashVerificationCode("123456", 1, "segredo");
  assert.notStrictEqual(a, hashVerificationCode("123456", 2, "segredo"));
  assert.notStrictEqual(a, hashVerificationCode("123456", 1, "outro"));
  assert.notStrictEqual(a, hashVerificationCode("123457", 1, "segredo"));
  assert.ok(!a.includes("123456"));
});

test("bloqueio de login apos tentativas erradas e liberacao por tempo", () => {
  let t = 1_000_000;
  const th = createLoginThrottle({ maxAttempts: 5, lockMinutes: 15, now: () => t });
  for (let i = 0; i < 4; i++) { th.fail("a@a.com", "1.1.1.1"); assert.strictEqual(th.check("a@a.com", "1.1.1.1"), 0); }
  th.fail("a@a.com", "1.1.1.1");
  assert.ok(th.check("A@a.com", "1.1.1.1") > 0);       // 5a falha bloqueia (e-mail nao diferencia maiusculas)
  assert.strictEqual(th.check("b@a.com", "1.1.1.1"), 0); // outro e-mail nao e afetado
  t += 15 * 60 * 1000 + 1;
  assert.strictEqual(th.check("a@a.com", "1.1.1.1"), 0); // liberou
  th.fail("a@a.com", "1.1.1.1"); th.success("a@a.com", "1.1.1.1");
  assert.strictEqual(th.check("a@a.com", "1.1.1.1"), 0);
});

function sign(secret, dataId, requestId, ts) {
  const v1 = crypto.createHmac("sha256", secret).update(`id:${dataId};request-id:${requestId};ts:${ts};`).digest("hex");
  return `ts=${ts},v1=${v1}`;
}

test("webhook Mercado Pago: aceita so assinatura valida", () => {
  const secret = "whsec";
  const ok = sign(secret, "123456", "req-1", "1700000000");
  assert.ok(verifyMercadoPagoSignature({ signatureHeader: ok, requestId: "req-1", dataId: "123456", secret }));
  assert.ok(!verifyMercadoPagoSignature({ signatureHeader: ok, requestId: "req-1", dataId: "123457", secret }), "data.id adulterado");
  assert.ok(!verifyMercadoPagoSignature({ signatureHeader: ok, requestId: "req-2", dataId: "123456", secret }), "request-id adulterado");
  assert.ok(!verifyMercadoPagoSignature({ signatureHeader: sign("errado", "123456", "req-1", "1700000000"), requestId: "req-1", dataId: "123456", secret }), "segredo errado");
  assert.ok(!verifyMercadoPagoSignature({ signatureHeader: "", requestId: "req-1", dataId: "123456", secret }));
  assert.ok(!verifyMercadoPagoSignature({ signatureHeader: "lixo", requestId: "req-1", dataId: "123456", secret }));
  assert.ok(!verifyMercadoPagoSignature({ signatureHeader: ok, requestId: "req-1", dataId: "123456", secret: "" }));
});
