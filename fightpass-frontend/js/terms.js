(function () {
  if (window.FightPassTerms && window.FightPassTerms.firstLogin) return;
  const api = window.FightPassApi;

  function html(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function termsBody(terms) {
    return `
      <p>${html(terms.summary)}</p>
      <div class="terms-list">
        ${terms.sections.map((section) => `
          <div>
            <strong>${html(section.title)}</strong>
            <span>${html(section.text)}</span>
          </div>
        `).join("")}
      </div>
      <small>Versao: ${html(terms.version)}</small>`;
  }

  function createAcceptance(selector, options) {
    const container = document.querySelector(selector);
    const origin = options.origin;
    let terms = null;
    let alreadyAccepted = false;

    function checkbox() {
      return container ? container.querySelector("[data-terms-accepted]") : null;
    }

    function render() {
      if (!container || !terms) return;
      if (alreadyAccepted) {
        container.hidden = true;
        container.innerHTML = "";
        return;
      }
      container.hidden = false;
      container.innerHTML = `
        <section class="terms-acceptance" aria-labelledby="${html(origin)}-terms-title">
          <div class="terms-box">
            <h2 id="${html(origin)}-terms-title">${html(terms.title)}</h2>
            ${termsBody(terms)}
          </div>
          <label class="terms-checkbox">
            <input type="checkbox" data-terms-accepted required>
            <span>Li e aceito os Termos de Uso do FightPass.</span>
          </label>
        </section>
      `;
    }

    async function load() {
      if (!container) return;
      const response = await api.request("/terms/current");
      terms = response.data;
      // Na contratacao de plano o usuario ja esta logado: se aceitou antes, nao pergunta de novo.
      if (origin === "contratacao_plano") {
        try {
          const status = await api.request("/terms/status");
          alreadyAccepted = Boolean(status.data && status.data.accepted);
        } catch (error) {
          alreadyAccepted = false;
        }
      }
      render();
    }

    function isAccepted() {
      if (alreadyAccepted) return true;
      return Boolean(terms && checkbox() && checkbox().checked);
    }

    function payload() {
      return {
        termsAccepted: isAccepted(),
        termsVersion: terms ? terms.version : null,
        termsOrigin: origin
      };
    }

    return { load, isAccepted, payload };
  }

  // Primeiro acesso: janela obrigatoria, mostrada uma unica vez por usuario (e por versao dos termos).
  async function firstLogin() {
    if (document.getElementById("fp-first-terms")) return;
    let terms;
    try {
      const status = await api.request("/terms/status");
      if (status.data && status.data.accepted) return;
      terms = (await api.request("/terms/current")).data;
    } catch (error) {
      return;
    }

    const overlay = document.createElement("div");
    overlay.id = "fp-first-terms";
    overlay.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,.65);display:flex;align-items:center;justify-content:center;padding:16px;";
    overlay.innerHTML = `
      <div role="dialog" aria-modal="true" style="background:#fff;color:#0F172A;max-width:640px;width:100%;max-height:90vh;display:flex;flex-direction:column;border-radius:16px;padding:24px;gap:14px;">
        <h2 style="font-size:20px;">${html(terms.title)}</h2>
        <div class="terms-box" style="overflow:auto;max-height:45vh;border:1px solid #E2E8F0;border-radius:10px;padding:12px;">${termsBody(terms)}</div>
        <label style="display:flex;gap:10px;align-items:flex-start;">
          <input type="checkbox" id="fp-first-terms-check" style="margin-top:3px;">
          <span>Li e aceito os Termos de Uso do FightPass.</span>
        </label>
        <p id="fp-first-terms-error" style="color:#991B1B;font-size:13px;" hidden></p>
        <button type="button" id="fp-first-terms-btn" class="btn-primary" disabled style="width:auto;align-self:flex-end;padding:12px 24px;">Aceitar e continuar</button>
      </div>`;
    document.body.appendChild(overlay);

    const check = overlay.querySelector("#fp-first-terms-check");
    const button = overlay.querySelector("#fp-first-terms-btn");
    const error = overlay.querySelector("#fp-first-terms-error");
    check.addEventListener("change", () => { button.disabled = !check.checked; });
    button.addEventListener("click", async () => {
      button.disabled = true;
      error.hidden = true;
      try {
        await api.request("/terms/accept", {
          method: "POST",
          body: { termsAccepted: true, termsVersion: terms.version, origin: "cadastro" }
        });
        overlay.remove();
      } catch (err) {
        error.textContent = err.message || "Nao foi possivel registrar o aceite.";
        error.hidden = false;
        button.disabled = false;
      }
    });
  }

  window.FightPassTerms = { createAcceptance, firstLogin };
})();