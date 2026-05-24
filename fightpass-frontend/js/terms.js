(function () {
  const api = window.FightPassApi;

  function html(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function createAcceptance(selector, options) {
    const container = document.querySelector(selector);
    const origin = options.origin;
    let terms = null;

    function checkbox() {
      return container ? container.querySelector("[data-terms-accepted]") : null;
    }

    function render() {
      if (!container || !terms) return;
      container.hidden = false;
      container.innerHTML = `
        <section class="terms-acceptance" aria-labelledby="${html(origin)}-terms-title">
          <div class="terms-box">
            <h2 id="${html(origin)}-terms-title">${html(terms.title)}</h2>
            <p>${html(terms.summary)}</p>
            <div class="terms-list">
              ${terms.sections.map((section) => `
                <div>
                  <strong>${html(section.title)}</strong>
                  <span>${html(section.text)}</span>
                </div>
              `).join("")}
            </div>
            <small>Versao: ${html(terms.version)}</small>
          </div>
          <label class="terms-checkbox">
            <input type="checkbox" data-terms-accepted>
            <span>Li e aceito os Termos de Uso do FightPass.</span>
          </label>
        </section>
      `;
    }

    async function load() {
      if (!container) return;
      const response = await api.request("/terms/current");
      terms = response.data;
      render();
    }

    function isAccepted() {
      return Boolean(terms && checkbox() && checkbox().checked);
    }

    function payload() {
      return {
        termsAccepted: isAccepted(),
        termsVersion: terms ? terms.version : null,
        termsOrigin: origin
      };
    }

    return {
      load,
      isAccepted,
      payload
    };
  }

  window.FightPassTerms = {
    createAcceptance
  };
})();
