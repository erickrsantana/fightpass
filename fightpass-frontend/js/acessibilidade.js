/*
 * FightPass - Central de Acessibilidade
 * Botao flutuante que liga/desliga recursos para:
 *  - pessoas cegas / baixa visao: leitor de voz ao passar o mouse, focar (Tab) ou tocar; fonte maior; alto contraste
 *  - pessoas surdas: alertas visuais (faixa + piscada + vibracao) para toda mensagem do sistema e tradutor de Libras (VLibras)
 *  - pessoas daltonicas: filtros de correcao (protanopia, deuteranopia, tritanopia, acromatopsia) e marcadores alem da cor
 * As escolhas ficam salvas no navegador (localStorage) e valem para todas as telas.
 */
(function () {
  "use strict";

  var STORE_KEY = "fightpass.a11y";
  var defaults = {
    voice: false, voiceRate: 1,
    visualAlerts: false, libras: false,
    colorMode: "none", markers: false,
    contrast: false, fontScale: 100, links: false, calm: false
  };
  var state = load();
  var speakTimer = null;
  var lastSpoken = null;

  function load() {
    try {
      var saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      return Object.assign({}, defaults, saved || {});
    } catch (e) { return Object.assign({}, defaults); }
  }
  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* sem storage */ } }

  /* ---------- estilos ---------- */
  var css = "\n" +
    "#fp-a11y-fab{position:fixed;left:16px;bottom:16px;z-index:2147483000;width:52px;height:52px;border-radius:50%;border:3px solid #fff;background:#1B59F8;color:#fff;font:700 22px/1 Arial,sans-serif;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.35)}\n" +
    "#fp-a11y-fab:focus-visible,#fp-a11y-panel button:focus-visible,#fp-a11y-panel select:focus-visible,#fp-a11y-panel input:focus-visible{outline:3px solid #FFB000;outline-offset:2px}\n" +
    "#fp-a11y-panel{position:fixed;left:16px;bottom:78px;z-index:2147483000;width:min(340px,calc(100vw - 32px));max-height:calc(100vh - 100px);overflow:auto;background:#fff;color:#111827;border:2px solid #1B59F8;border-radius:14px;padding:14px 16px;font:14px/1.4 Arial,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.35)}\n" +
    "#fp-a11y-panel[hidden]{display:none}\n" +
    "#fp-a11y-panel h2{font-size:16px;margin:0 0 4px}\n" +
    "#fp-a11y-panel h3{font-size:13px;margin:14px 0 6px;color:#1B59F8;text-transform:uppercase;letter-spacing:.04em}\n" +
    "#fp-a11y-panel label.fp-row{display:flex;align-items:center;gap:10px;padding:6px 0;cursor:pointer}\n" +
    "#fp-a11y-panel input[type=checkbox]{width:20px;height:20px;flex:none}\n" +
    "#fp-a11y-panel select{width:100%;padding:8px;border:1px solid #94A3B8;border-radius:8px;font-size:14px;background:#fff;color:#111827}\n" +
    "#fp-a11y-panel .fp-btns{display:flex;gap:8px;align-items:center}\n" +
    "#fp-a11y-panel .fp-btns button,#fp-a11y-reset{padding:8px 12px;border:1px solid #1B59F8;border-radius:8px;background:#fff;color:#1B59F8;font-weight:700;cursor:pointer}\n" +
    "#fp-a11y-reset{margin-top:12px;width:100%}\n" +
    "#fp-a11y-panel small{color:#475569;display:block;margin-top:2px}\n" +
    "#fp-a11y-banner{position:fixed;left:0;right:0;top:0;z-index:2147483001;padding:16px 20px;font:700 18px/1.3 Arial,sans-serif;color:#fff;text-align:center;box-shadow:0 4px 14px rgba(0,0,0,.4)}\n" +
    "#fp-a11y-banner[hidden]{display:none}\n" +
    "#fp-a11y-banner.fp-error{background:#B00020}#fp-a11y-banner.fp-success{background:#0B6B2E}#fp-a11y-banner.fp-info{background:#0B4FD6}\n" +
    "#fp-a11y-flash{position:fixed;inset:0;z-index:2147483002;pointer-events:none;border:12px solid #FFB000;opacity:0}\n" +
    "#fp-a11y-flash.on{animation:fp-flash .9s ease-out 2}\n" +
    "@keyframes fp-flash{0%{opacity:1}100%{opacity:0}}\n" +
    ".fp-speaking{outline:4px solid #FFB000!important;outline-offset:2px}\n" +
    "html.fp-contrast,html.fp-contrast body{background:#000!important;color:#fff!important}\n" +
    "html.fp-contrast *:not(img):not(svg):not(#fp-a11y-panel):not(#fp-a11y-panel *):not(#fp-a11y-banner):not(#fp-a11y-fab){background-color:#000!important;color:#fff!important;border-color:#fff!important;box-shadow:none!important;text-shadow:none!important}\n" +
    "html.fp-contrast a{color:#FFEB3B!important;text-decoration:underline!important}\n" +
    "html.fp-contrast button,html.fp-contrast .btn-primary{border:2px solid #FFEB3B!important}\n" +
    "html.fp-links a{text-decoration:underline!important;font-weight:700!important}\n" +
    "html.fp-calm *,html.fp-calm *::before,html.fp-calm *::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}\n" +
    /* marcadores alem da cor para quem nao distingue verde/vermelho */
    "html.fp-markers .tag-ok::before,html.fp-markers .state-message.success::before{content:'\\2714  '}\n" +
    "html.fp-markers .tag-bad::before,html.fp-markers .state-message.error::before{content:'\\2716  '}\n" +
    "html.fp-markers .tag-warn::before,html.fp-markers .state-message.loading::before{content:'\\25B2  '}\n" +
    "html.fp-markers .state-message{border-left:8px solid currentColor!important}\n" +
    "html.fp-markers .input-error{border-width:3px!important;border-style:dashed!important}\n";

  function injectStyle() {
    var el = document.createElement("style");
    el.id = "fp-a11y-style";
    el.textContent = css;
    document.head.appendChild(el);
  }

  /* ---------- filtros de daltonismo (matrizes de correcao) ---------- */
  var SIM = {
    protanopia: [[0.567, 0.433, 0], [0.558, 0.442, 0], [0, 0.242, 0.758]],
    deuteranopia: [[0.625, 0.375, 0], [0.7, 0.3, 0], [0, 0.3, 0.7]],
    tritanopia: [[0.95, 0.05, 0], [0, 0.433, 0.567], [0, 0.475, 0.525]]
  };
  var SHIFT = {
    protanopia: [[0, 0, 0], [0.7, 1, 0], [0.7, 0, 1]],
    deuteranopia: [[0, 0, 0], [0.7, 1, 0], [0.7, 0, 1]],
    tritanopia: [[1, 0, 0.7], [0, 1, 0.7], [0, 0, 0]]
  };

  // corrigida = original + SHIFT * (original - simulada)  =>  C = I + SHIFT * (I - SIM)
  function correctionMatrix(mode) {
    var sim = SIM[mode], sh = SHIFT[mode], c = [];
    for (var i = 0; i < 3; i++) {
      c.push([]);
      for (var j = 0; j < 3; j++) {
        var sum = 0;
        for (var k = 0; k < 3; k++) sum += sh[i][k] * ((k === j ? 1 : 0) - sim[k][j]);
        c[i].push((i === j ? 1 : 0) + sum);
      }
    }
    return c;
  }
  function matrixValues(m) {
    return m.map(function (r) { return r.map(function (v) { return v.toFixed(4); }).join(" ") + " 0 0"; }).join(" ").replace(/^/, "") + " 0 0 0 1 0";
  }

  function buildFilters() {
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("width", "0"); svg.setAttribute("height", "0");
    svg.setAttribute("aria-hidden", "true");
    svg.style.cssText = "position:absolute;width:0;height:0";
    var defs = document.createElementNS(ns, "defs");
    ["protanopia", "deuteranopia", "tritanopia"].forEach(function (mode) {
      defs.appendChild(filterEl(ns, "fp-" + mode, matrixValues(correctionMatrix(mode))));
    });
    // acromatopsia: tons de cinza com contraste reforcado
    defs.appendChild(filterEl(ns, "fp-acromatopsia", "0.299 0.587 0.114 0 0 0.299 0.587 0.114 0 0 0.299 0.587 0.114 0 0 0 0 0 1 0"));
    svg.appendChild(defs);
    document.body.appendChild(svg);
  }
  function filterEl(ns, id, values) {
    var f = document.createElementNS(ns, "filter");
    f.setAttribute("id", id);
    f.setAttribute("color-interpolation-filters", "sRGB");
    var m = document.createElementNS(ns, "feColorMatrix");
    m.setAttribute("type", "matrix");
    m.setAttribute("values", values);
    f.appendChild(m);
    return f;
  }

  /* ---------- voz (cegos / baixa visao) ---------- */
  var SPEAKABLE = "a,button,input,select,textarea,img,h1,h2,h3,h4,h5,h6,label,p,li,td,th,summary,[role=button],[role=link],[aria-label],.tag,.state-message,.stat,.logo";
  var supportsSpeech = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

  function labelFor(el) {
    if (el.id) {
      var l = document.querySelector('label[for="' + (window.CSS && CSS.escape ? CSS.escape(el.id) : el.id) + '"]');
      if (l) return l.innerText;
    }
    var wrap = el.closest("label");
    return wrap ? wrap.innerText : "";
  }

  function describe(el) {
    if (el.closest("#fp-a11y-panel,#fp-a11y-fab") && !el.matches("#fp-a11y-fab,#fp-a11y-panel button,#fp-a11y-panel label,#fp-a11y-panel select,#fp-a11y-panel h2,#fp-a11y-panel h3")) return "";
    var tag = el.tagName.toLowerCase();
    var name = el.getAttribute("aria-label") || "";
    var text;
    if (tag === "img") return "Imagem: " + (el.getAttribute("alt") || el.getAttribute("title") || "sem descrição");
    if (tag === "input") {
      var type = (el.getAttribute("type") || "text").toLowerCase();
      var lab = name || labelFor(el) || el.getAttribute("placeholder") || el.getAttribute("name") || "";
      if (type === "checkbox") return "Caixa de seleção: " + lab + ", " + (el.checked ? "marcada" : "desmarcada");
      if (type === "radio") return "Opção: " + lab + ", " + (el.checked ? "selecionada" : "não selecionada");
      if (type === "submit" || type === "button") return "Botão: " + (el.value || lab);
      if (type === "password") return "Campo de senha: " + lab + ". O conteúdo não será lido.";
      return "Campo de texto: " + lab + (el.required ? ", obrigatório" : "");
    }
    if (tag === "select") {
      var opt = el.options[el.selectedIndex];
      return "Lista: " + (name || labelFor(el) || el.name || "") + ", selecionado " + (opt ? opt.text : "nenhum");
    }
    if (tag === "textarea") return "Campo de texto longo: " + (name || labelFor(el) || el.getAttribute("placeholder") || "");
    text = (name || el.innerText || el.getAttribute("title") || "").replace(/\s+/g, " ").trim();
    if (!text) return "";
    if (text.length > 280) text = text.slice(0, 280) + "...";
    if (tag === "button" || el.getAttribute("role") === "button") return "Botão: " + text;
    if (tag === "a") return "Link: " + text;
    if (/^h[1-6]$/.test(tag)) return "Título: " + text;
    return text;
  }

  function clearHighlight() {
    var old = document.querySelector(".fp-speaking");
    if (old) old.classList.remove("fp-speaking");
  }

  function speak(text, el) {
    if (!supportsSpeech || !text) return;
    window.speechSynthesis.cancel();
    clearHighlight();
    var u = new SpeechSynthesisUtterance(text);
    u.lang = "pt-BR";
    u.rate = Number(state.voiceRate) || 1;
    var voices = window.speechSynthesis.getVoices();
    var pt = voices.filter(function (v) { return /^pt(-|_)BR/i.test(v.lang); })[0] || voices.filter(function (v) { return /^pt/i.test(v.lang); })[0];
    if (pt) u.voice = pt;
    if (el) { el.classList.add("fp-speaking"); u.onend = u.onerror = function () { el.classList.remove("fp-speaking"); }; }
    window.speechSynthesis.speak(u);
  }

  function onPointerOrFocus(event) {
    if (!state.voice) return;
    var target = event.target && event.target.closest ? event.target.closest(SPEAKABLE) : null;
    if (!target || target === lastSpoken && event.type !== "focusin") return;
    clearTimeout(speakTimer);
    speakTimer = setTimeout(function () {
      var text = describe(target);
      if (!text) return;
      lastSpoken = target;
      speak(text, target);
    }, event.type === "focusin" ? 0 : 220);
  }

  /* ---------- alertas visuais (surdos) ---------- */
  var banner, flash, bannerTimer;
  function showVisualAlert(message, type) {
    if (!state.visualAlerts || !message) return;
    banner.className = "fp-" + (type || "info");
    banner.textContent = (type === "error" ? "ATENÇÃO: " : type === "success" ? "OK: " : "AVISO: ") + message;
    banner.hidden = false;
    flash.classList.remove("on"); void flash.offsetWidth; flash.classList.add("on");
    try { if (navigator.vibrate) navigator.vibrate(type === "error" ? [200, 100, 200, 100, 200] : [120]); } catch (e) { /* sem vibracao */ }
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(function () { banner.hidden = true; }, 7000);
  }

  function watchMessages() {
    var seen = new WeakMap();
    var obs = new MutationObserver(function (mutations) {
      mutations.forEach(function (m) {
        var node = m.target.nodeType === 1 ? m.target : m.target.parentElement;
        var box = node && node.closest ? node.closest(".state-message,[data-flash]") : null;
        if (!box || box.hidden) return;
        var text = (box.innerText || "").replace(/\s+/g, " ").trim();
        if (!text || seen.get(box) === text || /^(carregando|autenticando|processando|criando|conferindo)/i.test(text)) return;
        seen.set(box, text);
        var type = /error/.test(box.className) ? "error" : /success/.test(box.className) ? "success" : "info";
        showVisualAlert(text, type);
        if (state.voice && type !== "info") speak((type === "error" ? "Erro. " : "Sucesso. ") + text);
      });
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["hidden", "class"] });
  }

  /* ---------- Libras (VLibras - Governo Federal) ---------- */
  function setLibras(on) {
    var existing = document.querySelector("[vw]");
    if (!on) { if (existing) existing.style.display = "none"; return; }
    if (existing) { existing.style.display = ""; return; }
    var box = document.createElement("div");
    box.setAttribute("vw", ""); box.className = "enabled";
    box.innerHTML = '<div vw-access-button class="active"></div><div vw-plugin-wrapper><div class="vw-plugin-top-wrapper"></div></div>';
    document.body.appendChild(box);
    var s = document.createElement("script");
    s.src = "https://vlibras.gov.br/app/vlibras-plugin.js";
    s.onload = function () { try { new window.VLibras.Widget("https://vlibras.gov.br/app"); } catch (e) { /* offline */ } };
    document.body.appendChild(s);
  }

  /* ---------- aplicar preferencias ---------- */
  function apply() {
    var root = document.documentElement;
    root.classList.toggle("fp-contrast", !!state.contrast);
    root.classList.toggle("fp-links", !!state.links);
    root.classList.toggle("fp-calm", !!state.calm);
    root.classList.toggle("fp-markers", !!state.markers);
    root.style.fontSize = state.fontScale !== 100 ? state.fontScale + "%" : "";
    root.style.filter = state.colorMode !== "none" ? "url(#fp-" + state.colorMode + ")" : "";
    if (!state.voice && supportsSpeech) { window.speechSynthesis.cancel(); clearHighlight(); }
    setLibras(!!state.libras);
    document.documentElement.setAttribute("data-a11y-active", String(
      state.voice || state.visualAlerts || state.libras || state.colorMode !== "none" || state.markers || state.contrast || state.fontScale !== 100 || state.links || state.calm
    ));
    save();
  }

  /* ---------- painel ---------- */
  var panel, fab;
  function row(id, text, hint) {
    return '<label class="fp-row" for="' + id + '"><input type="checkbox" id="' + id + '"><span>' + text + (hint ? "<small>" + hint + "</small>" : "") + "</span></label>";
  }

  function buildPanel() {
    fab = document.createElement("button");
    fab.id = "fp-a11y-fab"; fab.type = "button";
    fab.setAttribute("aria-label", "Acessibilidade. Abrir menu de recursos para cegos, surdos e daltônicos");
    fab.setAttribute("aria-expanded", "false");
    fab.setAttribute("aria-controls", "fp-a11y-panel");
    fab.title = "Acessibilidade (Alt+A)";
    fab.innerHTML = '<span aria-hidden="true">&#9855;</span>';

    panel = document.createElement("div");
    panel.id = "fp-a11y-panel"; panel.hidden = true;
    panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "Central de acessibilidade");
    panel.innerHTML =
      "<h2>Acessibilidade</h2>" +
      "<small>Atalho: Alt + A. Esc fecha.</small>" +
      "<h3>Visão (cegos e baixa visão)</h3>" +
      row("fp-voice", "Leitor de voz", "Passe o mouse, toque ou use Tab em qualquer item para ouvir o que está escrito.") +
      '<label for="fp-rate" style="display:block;margin:4px 0">Velocidade da voz</label>' +
      '<select id="fp-rate"><option value="0.8">Devagar</option><option value="1">Normal</option><option value="1.3">Rápida</option></select>' +
      '<div class="fp-btns" style="margin-top:8px"><button type="button" id="fp-font-minus" aria-label="Diminuir letras">A-</button><button type="button" id="fp-font-plus" aria-label="Aumentar letras">A+</button><span id="fp-font-val" aria-live="polite"></span></div>' +
      row("fp-contrast", "Alto contraste (fundo preto)") +
      row("fp-links", "Destacar links") +
      "<h3>Audição (surdos)</h3>" +
      row("fp-visual", "Alertas visuais", "Faixa grande, piscada na tela e vibração no celular para toda mensagem do sistema.") +
      row("fp-libras", "Tradutor de Libras (VLibras)", "Abre o avatar que traduz o texto da tela para Libras.") +
      "<h3>Cores (daltonismo)</h3>" +
      '<label for="fp-color" style="display:block;margin:4px 0">Filtro de correção</label>' +
      '<select id="fp-color"><option value="none">Nenhum</option><option value="protanopia">Protanopia (dificuldade com vermelho)</option><option value="deuteranopia">Deuteranopia (dificuldade com verde)</option><option value="tritanopia">Tritanopia (dificuldade com azul)</option><option value="acromatopsia">Acromatopsia (tons de cinza)</option></select>' +
      row("fp-markers", "Marcar status além da cor", "Adiciona símbolos (✔ ✖ ▲) e bordas em avisos, erros e situações.") +
      "<h3>Movimento</h3>" +
      row("fp-calm", "Reduzir animações") +
      '<button type="button" id="fp-a11y-reset">Restaurar padrão</button>';

    document.body.appendChild(fab);
    document.body.appendChild(panel);

    banner = document.createElement("div");
    banner.id = "fp-a11y-banner"; banner.hidden = true;
    banner.setAttribute("role", "alert");
    flash = document.createElement("div");
    flash.id = "fp-a11y-flash"; flash.setAttribute("aria-hidden", "true");
    document.body.appendChild(banner);
    document.body.appendChild(flash);

    var $ = function (id) { return document.getElementById(id); };
    function sync() {
      $("fp-voice").checked = state.voice;
      $("fp-rate").value = String(state.voiceRate);
      $("fp-contrast").checked = state.contrast;
      $("fp-links").checked = state.links;
      $("fp-visual").checked = state.visualAlerts;
      $("fp-libras").checked = state.libras;
      $("fp-color").value = state.colorMode;
      $("fp-markers").checked = state.markers;
      $("fp-calm").checked = state.calm;
      $("fp-font-val").textContent = state.fontScale + "%";
    }
    sync();

    function bindCheck(id, key, onOn) {
      $(id).addEventListener("change", function (e) {
        state[key] = e.target.checked; apply();
        if (e.target.checked && onOn) onOn();
      });
    }
    bindCheck("fp-voice", "voice", function () { speak("Leitor de voz ligado. Passe o mouse sobre qualquer item para ouvir."); });
    bindCheck("fp-contrast", "contrast");
    bindCheck("fp-links", "links");
    bindCheck("fp-visual", "visualAlerts", function () { showVisualAlert("Alertas visuais ligados.", "success"); });
    bindCheck("fp-libras", "libras");
    bindCheck("fp-markers", "markers");
    bindCheck("fp-calm", "calm");
    $("fp-rate").addEventListener("change", function (e) { state.voiceRate = Number(e.target.value); save(); speak("Velocidade ajustada."); });
    $("fp-color").addEventListener("change", function (e) { state.colorMode = e.target.value; apply(); });
    $("fp-font-plus").addEventListener("click", function () { state.fontScale = Math.min(200, state.fontScale + 10); sync(); apply(); });
    $("fp-font-minus").addEventListener("click", function () { state.fontScale = Math.max(80, state.fontScale - 10); sync(); apply(); });
    $("fp-a11y-reset").addEventListener("click", function () { state = Object.assign({}, defaults); sync(); apply(); });

    function toggle(open) {
      var show = typeof open === "boolean" ? open : panel.hidden;
      panel.hidden = !show;
      fab.setAttribute("aria-expanded", String(show));
      if (show) { var first = $("fp-voice"); if (first) first.focus(); }
    }
    fab.addEventListener("click", function () { toggle(); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !panel.hidden) { toggle(false); fab.focus(); }
      if (e.altKey && (e.key === "a" || e.key === "A")) { e.preventDefault(); toggle(); }
    });
  }

  function init() {
    injectStyle();
    buildFilters();
    buildPanel();
    watchMessages();
    document.addEventListener("mouseover", onPointerOrFocus, true);
    document.addEventListener("focusin", onPointerOrFocus, true);
    document.addEventListener("touchstart", function (e) { onPointerOrFocus({ target: e.target, type: "touch" }); }, { passive: true, capture: true });
    if (supportsSpeech) window.speechSynthesis.getVoices();
    apply();
    window.FightPassA11y = { speak: speak, alert: showVisualAlert, state: function () { return Object.assign({}, state); } };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
