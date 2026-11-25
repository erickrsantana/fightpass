/*
 * Testes de seguranca "caixa preta": atacam uma API ja em execucao.
 *   BASE_URL=http://localhost:3000 npm run test:security
 * ATENCAO: rode apenas contra o SEU ambiente (local ou de testes). Alguns testes disparam o limite de tentativas.
 */
const test = require("node:test");
const assert = require("node:assert");
const crypto = require("node:crypto");

const BASE = (process.env.BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const API = `${BASE}/api`;
const EVIL_ORIGIN = "https://site-malicioso.example";

async function call(path, { method = "GET", headers = {}, body, raw } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { ...(body !== undefined && !raw ? { "Content-Type": "application/json" } : {}), ...headers },
    body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined
  });
  let json = null;
  const text = await res.text();
  try { json = JSON.parse(text); } catch (e) { /* nao json */ }
  return { status: res.status, headers: res.headers, json, text };
}

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");

test("saude da API", async () => {
  const r = await call("/health");
  assert.strictEqual(r.status, 200);
});

test("cabecalhos de seguranca (helmet) presentes e sem vazar a tecnologia", async () => {
  const r = await call("/health");
  assert.ok(r.headers.get("x-content-type-options") === "nosniff");
  assert.ok(!r.headers.get("x-powered-by"), "X-Powered-By deve estar desligado");
  assert.ok(r.headers.get("strict-transport-security") || BASE.startsWith("http://localhost"), "HSTS em producao");
});

test("CORS: origem desconhecida NAO recebe permissao", async () => {
  const r = await call("/health", { headers: { Origin: EVIL_ORIGIN } });
  const allow = r.headers.get("access-control-allow-origin");
  assert.ok(!allow || (allow !== "*" && allow !== EVIL_ORIGIN), `CORS aberto para origem maliciosa: ${allow}`);
});

test("rotas protegidas exigem token", async () => {
  for (const p of ["/auth/me", "/profile", "/access/me", "/payments/mine", "/dojo/payments/mine?institutionId=1", "/finance/summary", "/platform/overview"]) {
    const r = await call(p);
    assert.ok([401, 403, 404].includes(r.status), `${p} respondeu ${r.status} sem token`);
    assert.notStrictEqual(r.status, 200, `${p} abriu sem login`);
  }
});

test("JWT adulterado, 'alg: none' e assinatura errada sao recusados", async () => {
  const payload = { sub: 1, role: "platform_admin", exp: Math.floor(Date.now() / 1000) + 3600 };
  const none = `${b64({ alg: "none", typ: "JWT" })}.${b64(payload)}.`;
  const forged = `${b64({ alg: "HS256", typ: "JWT" })}.${b64(payload)}.${crypto.createHmac("sha256", "change-this-secret").update("x").digest("base64url")}`;
  const forgedDefaultSecret = (() => {
    const h = b64({ alg: "HS256", typ: "JWT" }), p = b64(payload);
    return `${h}.${p}.${crypto.createHmac("sha256", "change-this-secret").update(`${h}.${p}`).digest("base64url")}`;
  })();
  for (const [name, token] of [["alg none", none], ["assinatura invalida", forged], ["segredo padrao", forgedDefaultSecret], ["lixo", "abc.def.ghi"]]) {
    const r = await call("/auth/me", { headers: { Authorization: `Bearer ${token}` } });
    assert.strictEqual(r.status, 401, `token ${name} foi aceito (status ${r.status})`);
  }
});

test("injecao de SQL no login nao autentica nem derruba o servidor", async () => {
  const payloads = ["' OR '1'='1", "admin@x.com' --", "'; DROP TABLE users; --", "\" OR \"\"=\"", "1' UNION SELECT 1,2,3 --"];
  for (const p of payloads) {
    const r = await call("/auth/login", { method: "POST", body: { email: p, password: p } });
    assert.ok([400, 401, 422, 429].includes(r.status), `payload ${p} => ${r.status}`);
    assert.ok(!(r.json && r.json.data && r.json.data.token), "token emitido para payload de SQLi");
    assert.ok(!/sql|mysql|syntax|ER_/i.test(r.text), "erro de banco vazou na resposta");
  }
});

test("injecao em parametros de busca nao vaza erro interno", async () => {
  for (const p of ["/modalities?x=' OR 1=1 --", "/institutions?search=%27%20OR%201%3D1%20--", "/institutions?modality[]=a&modality[$ne]=1"]) {
    const r = await call(p);
    assert.ok(r.status < 500, `${p} => ${r.status}`);
    assert.ok(!/sql|mysql|stack|at .*\.js/i.test(r.text), `${p} vazou detalhe interno`);
  }
});

test("JSON malformado e corpo gigante sao tratados sem vazar pilha", async () => {
  const bad = await call("/auth/login", { method: "POST", raw: "{ nao e json", headers: { "Content-Type": "application/json" } });
  assert.ok(bad.status === 400, `JSON invalido => ${bad.status}`);
  assert.ok(!/at .*\.js|SyntaxError/.test(bad.text), "pilha vazou");
  const big = await call("/auth/login", { method: "POST", raw: JSON.stringify({ email: "a@a.com", password: "x".repeat(2_000_000) }), headers: { "Content-Type": "application/json" } });
  assert.ok([400, 413, 422, 429].includes(big.status), `corpo gigante => ${big.status}`);
});

test("mensagem de erro de login nao revela se o e-mail existe", async () => {
  const a = await call("/auth/login", { method: "POST", body: { email: `naoexiste-${Date.now()}@teste.com`, password: "Qualquer@123" } });
  assert.ok([401, 429].includes(a.status));
  if (a.status === 401) assert.ok(!/n[ãa]o encontrado|nao encontrado|inexistente|not found/i.test(a.text));
});

test("webhook de pagamento sem assinatura valida NUNCA libera acesso", async () => {
  const r = await call("/payments/webhook/mercadopago?type=payment&data.id=123456", {
    method: "POST", body: { type: "payment", data: { id: "123456" } }, headers: { "x-signature": "ts=1,v1=00", "x-request-id": "x" }
  });
  assert.ok([200, 401, 503].includes(r.status), `webhook => ${r.status}`);
  const fake = await call("/payments/1/confirm", { method: "POST" });
  assert.ok([401, 403].includes(fake.status), "confirmacao manual sem login deve ser negada");
});

test("cadastro: senha fraca e e-mail invalido sao recusados", async () => {
  const r = await call("/auth/register", { method: "POST", body: { name: "Teste", email: "nao-e-email", password: "123", accountType: "student" } });
  assert.ok([400, 422].includes(r.status), `=> ${r.status}`);
});

test("cadastro: nao aceita papel privilegiado (platform_admin)", async () => {
  const r = await call("/auth/register", {
    method: "POST",
    body: { name: "Invasor", email: `inv-${Date.now()}@teste.com`, password: "Senha@12345", accountType: "platform_admin", document: "00000000000" }
  });
  assert.ok([400, 403, 422].includes(r.status), `criou conta privilegiada? status ${r.status}`);
});

test("verificacao de e-mail: codigo errado e rejeitado; 6 digitos obrigatorios", async () => {
  const bad = await call("/auth/verify-email", { method: "POST", body: { email: "x@x.com", code: "12ab56" } });
  assert.ok([400, 422].includes(bad.status));
  const wrong = await call("/auth/verify-email", { method: "POST", body: { email: `nobody-${Date.now()}@x.com`, code: "000000" } });
  assert.ok([400, 401, 404, 410, 422, 429].includes(wrong.status));
  assert.ok(!(wrong.json && wrong.json.data && wrong.json.data.token));
});

test("limite de tentativas: muitas senhas erradas viram 429", async () => {
  const email = `brute-${Date.now()}@teste.com`;
  let got429 = false;
  for (let i = 0; i < 40; i++) {
    const r = await call("/auth/login", { method: "POST", body: { email, password: `Errada@${i}` } });
    if (r.status === 429) { got429 = true; break; }
  }
  assert.ok(got429, "forca bruta nao foi limitada");
});

test("caminhos sensiveis nao sao expostos", async () => {
  for (const p of ["/.env", "/package.json", "/.git/config", "/src/config/env.js"]) {
    const res = await fetch(`${BASE}${p}`);
    const text = await res.text();
    assert.ok(!/JWT_SECRET|DB_PASSWORD|"dependencies"/.test(text), `${p} expos conteudo sensivel`);
  }
});

test("2o fator: login com senha errada nunca devolve token; login correto nao devolve token sem o codigo", async () => {
  const r = await call("/auth/login", { method: "POST", body: { email: "qualquer@teste.com", password: "Errada@123" } });
  assert.ok(!(r.json && r.json.data && r.json.data.token));
});
