/* hCaptcha: carrega a chave publica da API e mostra o desafio dentro de <div data-captcha>. */
(function () {
  "use strict";
  var cfg = null, loading = null, widgets = new Map();

  function apiBase() {
    var c = window.FightPassConfig || {};
    var local = ["localhost", "127.0.0.1"].indexOf(window.location.hostname) !== -1;
    return String(c.apiBaseUrl || (local ? "http://localhost:3000/api" : "")).replace(/\/+$/, "");
  }

  function loadConfig() {
    if (loading) return loading;
    loading = fetch(apiBase() + "/auth/captcha-config").then(function (r) { return r.json(); })
      .then(function (j) { cfg = j && j.data ? j.data : { enabled: false }; return cfg; })
      .catch(function () { cfg = { enabled: false }; return cfg; });
    return loading;
  }

  function loadScript() {
    return new Promise(function (resolve) {
      if (window.hcaptcha) return resolve();
      window.__fpCaptchaReady = resolve;
      var s = document.createElement("script");
      s.src = "https://js.hcaptcha.com/1/api.js?render=explicit&onload=__fpCaptchaReady&hl=pt-BR";
      s.async = true; s.defer = true;
      document.head.appendChild(s);
    });
  }

  // Desenha o captcha em cada <div data-captcha> da pagina (se estiver ativo no servidor).
  async function mountAll() {
    var boxes = document.querySelectorAll("[data-captcha]");
    if (!boxes.length) return;
    var c = await loadConfig();
    if (!c.enabled || !c.siteKey) return;
    await loadScript();
    boxes.forEach(function (box) {
      if (widgets.has(box)) return;
      var holder = document.createElement("div");
      holder.setAttribute("role", "group");
      holder.setAttribute("aria-label", "Verificacao de seguranca (captcha)");
      box.appendChild(holder);
      widgets.set(box, window.hcaptcha.render(holder, { sitekey: c.siteKey, hl: "pt-BR" }));
    });
  }

  // Devolve o token do captcha do formulario ("" se o captcha esta desligado). Lanca erro se nao foi resolvido.
  async function tokenFor(form) {
    var c = await loadConfig();
    if (!c.enabled) return "";
    var box = form.querySelector("[data-captcha]");
    var id = box ? widgets.get(box) : undefined;
    var token = id !== undefined && window.hcaptcha ? window.hcaptcha.getResponse(id) : "";
    if (!token) throw new Error("Marque a caixa de verificacao (captcha) antes de continuar.");
    return token;
  }

  function reset(form) {
    var box = form && form.querySelector("[data-captcha]");
    var id = box ? widgets.get(box) : undefined;
    if (id !== undefined && window.hcaptcha) window.hcaptcha.reset(id);
  }

  window.FightPassCaptcha = { tokenFor: tokenFor, reset: reset, mountAll: mountAll };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountAll);
  else mountAll();
})();
