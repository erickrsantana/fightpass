(function () {
  const api = window.FightPassApi;

  const $ = (selector) => document.querySelector(selector);
  const html = (value) => String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  const money = (cents) => (Number(cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const THEMES = {
    bronze: { color: "#B45309", soft: "#FFF7ED", icon: "🥉" },
    prata: { color: "#475569", soft: "#F1F5F9", icon: "🥈" },
    ouro: { color: "#B7791F", soft: "#FFFBEB", icon: "🥇" },
    diamante: { color: "#4F46E5", soft: "#EEF2FF", icon: "💎" }
  };
  const METHODS = [
    ["pix", "Pix"], ["boleto", "Boleto"], ["credit_card", "Cartao de credito"], ["debit_card", "Cartao de debito"]
  ];
  const METHOD_NAMES = { pix: "Pix", boleto: "Boleto", credit_card: "Cartao de credito", debit_card: "Cartao de debito" };

  function say(text, type, details) {
    const box = $("#plans-message");
    if (!box) return;
    if (!text) { box.hidden = true; box.innerHTML = ""; return; }
    const colors = {
      error: ["#FEF2F2", "#991B1B"], success: ["#ECFDF5", "#065F46"],
      loading: ["#EFF6FF", "#1E40AF"], info: ["#F1F5F9", "#334155"]
    };
    const [bg, fg] = colors[type] || colors.info;
    const extra = Array.isArray(details) && details.length
      ? `<ul style="margin:6px 0 0 18px;">${details.map((d) => `<li>${html(d.msg || d.message || d)}</li>`).join("")}</ul>` : "";
    box.hidden = false;
    box.style.cssText = `background:${bg};color:${fg};padding:12px 16px;border-radius:10px;margin-bottom:16px;`;
    box.innerHTML = `${html(text)}${extra}`;
  }

  function detectBrand(number) {
    if (/^4/.test(number)) return "Visa";
    if (/^(5[1-5]|2[2-7])/.test(number)) return "Mastercard";
    if (/^3[47]/.test(number)) return "Amex";
    if (/^(606282|3841)/.test(number)) return "Hipercard";
    return "";
  }

  async function init(user) {
    const isAcademy = user && user.role === "institution_admin";
    const institutionId = isAcademy ? api.firstInstitutionId(user) : null;
    const prefix = isAcademy ? "/dojo/payments" : "/payments";
    const currentAccess = $("#current-access");
    const plansList = $("#plans-list");
    const legacyResult = $("#payment-result");
    const methodSelect = $("#payment-method");
    const methodSection = methodSelect ? methodSelect.closest("section") : null;
    const termsBox = $("#plans-terms");
    const checkout = $("#checkout");
    if (termsBox) termsBox.hidden = true;
    if (methodSection) methodSection.hidden = true;
    if (legacyResult) legacyResult.hidden = true;

    let open = false;
    let state = null;
    let plans = [];
    let termsVersion = null;
    let selected = null;      // { plan, penalty }
    let method = "pix";
    let payment = null;       // cobranca gerada (pix/boleto)
    let timer = null;

    try {
      const terms = await api.request("/terms/current");
      termsVersion = terms.data.version;
    } catch (error) { /* o servidor valida de qualquer forma */ }

    const feeCents = () => (!isAcademy && state && state.planChange ? Number(state.planChange.feeCents) || 0 : 0);

    function setOpen(value) {
      open = value;
      plansList.hidden = !open;
      if (!open && checkout) checkout.hidden = true;
      renderCurrent();
    }

    // ---------- plano atual ----------
    function renderCurrent() {
      if (!state) return;
      if (isAcademy) {
        const active = state.status === "active";
        const toggleA = `<button type="button" class="btn-secondary" data-toggle-plans style="width:auto;padding:8px 16px;font-size:14px;">${open ? "Fechar" : (active ? "Renovar mensalidade" : "Assinar plano")}</button>`;
        currentAccess.innerHTML = `
          <div class="current-plan">
            <div>
              <h2>Mensalidade da academia</h2>
              <p><strong>${html(state.plan_name || "Plano DOJO")}</strong> &middot; ${active ? `ativo ate ${api.formatDate(state.paid_until || state.next_billing_at)}` : '<span style="color:#991B1B;">sem plano ativo</span>'}</p>
              <small class="muted-note">${active ? "Sua academia pode criar e gerenciar aulas." : "Assine para criar e gerenciar aulas."}</small>
            </div>
            ${toggleA}
          </div>`;
        return;
      }
      const access = state.access;
      const toggle = `<button type="button" class="btn-secondary" data-toggle-plans style="width:auto;padding:8px 16px;font-size:14px;">${open ? "Fechar" : (state.hasActiveAccess ? "Alterar plano" : "Ver planos")}</button>`;
      if (!state.hasActiveAccess || !access) {
        currentAccess.innerHTML = `
          <div class="current-plan">
            <div><h2>Seu plano</h2><p style="color:#991B1B;">Voce nao possui plano ativo.</p></div>
            ${toggle}
          </div>`;
        return;
      }
      const unlimited = access.sessions_total === null || access.sessions_total === undefined;
      const used = Number(access.sessions_used || 0);
      const total = Number(access.sessions_total || 0);
      const percent = unlimited ? 100 : Math.min(100, Math.round((used / Math.max(total, 1)) * 100));
      const planName = access.plan_name || access.name || (state.planChange && state.planChange.currentPlanName) || "Plano ativo";
      currentAccess.innerHTML = `
        <div class="current-plan">
          <div>
            <h2>Seu plano</h2>
            <p><strong>${html(planName)}</strong> &middot; valido ate ${api.formatDate(access.expires_at)}</p>
            <div class="progress-bar" title="Treinos usados"><span style="width:${percent}%"></span></div>
            <small class="muted-note">${unlimited ? "Treinos ilimitados" : `${used} de ${total} treinos usados &middot; restam ${Math.max(0, total - used)}`}</small>
          </div>
          ${toggle}
        </div>
        ${open && feeCents() > 0 ? `
          <p class="fee-warning">
            Trocar para outro plano enquanto este esta em uso gera uma multa de <strong>${money(feeCents())}</strong>
            (${html(state.planChange.feePercent)}% do plano atual), cobrada junto com o novo plano.
          </p>` : ""}`;
    }

    // ---------- cartoes de plano ----------
    function renderPlans() {
      const fee = feeCents();
      const currentId = !isAcademy && state.planChange ? state.planChange.currentPlanId : null;
      plansList.innerHTML = plans.map((plan) => {
        const theme = THEMES[plan.code] || { color: "#1B59F8", soft: "#EFF6FF", icon: isAcademy ? "🥋" : "⭐" };
        const isCurrent = currentId && Number(currentId) === Number(plan.id);
        const unlimited = plan.sessionLimit === null || plan.sessionLimit === undefined;
        const perSession = isAcademy ? "mensalidade da academia" : (unlimited ? "treinos ilimitados" : `${money(plan.priceCents / plan.sessionLimit)} por treino`);
        const label = isAcademy ? (state.status === "active" ? "Renovar mensalidade" : "Assinar") : isCurrent ? "Renovar este plano" : (fee > 0 ? `Trocar (+ multa ${money(fee)})` : "Contratar");
        return `
          <article class="plan-card${isCurrent ? " current" : ""}" style="--plan-color:${theme.color};--plan-soft:${theme.soft};">
            ${plan.code === "ouro" ? `<span class="plan-badge">Mais escolhido</span>` : ""}
            ${isCurrent ? `<span class="plan-badge current-badge">Seu plano</span>` : ""}
            <div class="plan-head"><span class="plan-icon">${theme.icon}</span><h3>${html(plan.name)}</h3></div>
            <p class="plan-desc">${html(plan.description)}</p>
            <div class="plan-price"><strong>${money(plan.priceCents)}</strong><small>/ ${plan.durationDays} dias</small></div>
            <p class="plan-per">${html(perSession)}</p>
            <ul class="plan-list">
              ${(plan.features || []).map((f) => `<li>${html(f)}</li>`).join("")}
            </ul>
            <button class="plan-cta" type="button" data-plan-id="${plan.id}">${label}</button>
          </article>`;
      }).join("");
    }

    // ---------- checkout ----------
    function totalCents() {
      return selected ? selected.plan.priceCents + selected.penalty : 0;
    }

    function methodPanel() {
      if (payment) return paymentPanel();
      if (method === "pix") {
        return `<p class="muted-note">Voce recebe um QR Code e um codigo Pix copia-e-cola, validos por 30 minutos.</p>`;
      }
      if (method === "boleto") {
        return `<p class="muted-note">O boleto vence em 3 dias. A compensacao e simulada nesta demonstracao.</p>`;
      }
      const credit = method === "credit_card";
      const total = totalCents();
      return `
        <div class="card-form">
          <div class="input-group"><label>Numero do cartao</label>
            <div class="card-number-wrap"><input id="card-number" class="input-field" inputmode="numeric" autocomplete="off" placeholder="0000 0000 0000 0000" maxlength="23"><span id="card-brand" class="card-brand"></span></div></div>
          <div class="input-group"><label>Nome impresso no cartao</label><input id="card-holder" class="input-field" autocomplete="off" placeholder="COMO ESTA NO CARTAO"></div>
          <div class="card-row">
            <div class="input-group"><label>Validade</label><input id="card-expiry" class="input-field" inputmode="numeric" placeholder="MM/AA" maxlength="5"></div>
            <div class="input-group"><label>CVV</label><input id="card-cvv" class="input-field" inputmode="numeric" placeholder="123" maxlength="4"></div>
          </div>
          ${credit ? `<div class="input-group"><label>Parcelas</label>
            <select id="card-installments" class="input-field">
              ${[1, 2, 3].map((n) => `<option value="${n}">${n}x de ${money(Math.ceil(total / n))} sem juros</option>`).join("")}
            </select></div>` : ""}
          <p class="muted-note">Demonstracao: use 4111 1111 1111 1111 para aprovar ou 4000 0000 0000 0002 para ver um pagamento recusado. O cartao e o CVV nao sao guardados.</p>
        </div>`;
    }

    function paymentPanel() {
      if (payment.method === "pix") {
        return `
          <div class="pay-box">
            <div id="pix-qr" class="qr-frame"></div>
            <div>
              <p><strong>Pague com Pix</strong></p>
              <p class="muted-note">Expira em <strong id="pay-countdown">--:--</strong></p>
              <div class="token-box" id="pix-code">${html(payment.pixCode)}</div>
              <button type="button" class="btn-secondary" style="width:auto;padding:8px 16px;margin-top:8px;" data-copy="${html(payment.pixCode)}">Copiar codigo</button>
            </div>
          </div>
          <button type="button" class="btn-primary" style="width:auto;margin-top:16px;padding:12px 28px;" data-confirm-payment="${payment.id}">Ja paguei (simular)</button>`;
      }
      return `
        <div class="pay-box">
          <div>
            <p><strong>Boleto bancario</strong></p>
            <p class="muted-note">Vencimento: ${html(api.formatDate(payment.expiresAt))}</p>
            <div class="token-box">${html(payment.boletoCode)}</div>
            <button type="button" class="btn-secondary" style="width:auto;padding:8px 16px;margin-top:8px;" data-copy="${html(payment.boletoCode)}">Copiar linha digitavel</button>
          </div>
        </div>
        <button type="button" class="btn-primary" style="width:auto;margin-top:16px;padding:12px 28px;" data-confirm-payment="${payment.id}">Simular pagamento do boleto</button>`;
    }

    function renderCheckout() {
      if (!selected) { checkout.hidden = true; return; }
      checkout.hidden = false;
      const plan = selected.plan;
      checkout.innerHTML = `
        <div class="checkout-grid">
          <div>
            <h2>Finalizar contratacao</h2>
            ${payment ? "" : `<div class="method-tabs">${METHODS.map(([value, label]) =>
              `<button type="button" class="method-tab${method === value ? " active" : ""}" data-method="${value}">${label}</button>`).join("")}</div>`}
            <div id="method-panel">${methodPanel()}</div>
            ${payment ? `<button type="button" class="btn-cancel" data-cancel-payment="${payment.id}" style="margin-top:12px;">Cancelar cobranca</button>` : `
              <button type="button" class="btn-primary" id="pay-button" style="margin-top:18px;">${method === "pix" || method === "boleto" ? "Gerar cobranca" : `Pagar ${money(totalCents())}`}</button>`}
          </div>
          <aside class="order-summary">
            <h3>Resumo</h3>
            <p>${html(plan.name)}<strong>${money(plan.priceCents)}</strong></p>
            ${selected.penalty > 0 ? `<p>Multa de troca<strong>${money(selected.penalty)}</strong></p>` : ""}
            <p class="order-total">Total<strong>${money(totalCents())}</strong></p>
            <small>${isAcademy ? "Mensalidade da plataforma" : (plan.sessionLimit === null ? "Treinos ilimitados" : `${plan.sessionLimit} treinos`)} &middot; ${plan.durationDays} dias</small>
          </aside>
        </div>`;
      bindCardInputs();
      drawQr();
      startCountdown();
    }

    function bindCardInputs() {
      const number = $("#card-number");
      const expiry = $("#card-expiry");
      const cvv = $("#card-cvv");
      if (number) {
        number.addEventListener("input", () => {
          const digits = number.value.replace(/\D/g, "").slice(0, 19);
          number.value = digits.replace(/(.{4})/g, "$1 ").trim();
          const brand = $("#card-brand");
          if (brand) brand.textContent = detectBrand(digits);
        });
      }
      if (expiry) {
        expiry.addEventListener("input", () => {
          const digits = expiry.value.replace(/\D/g, "").slice(0, 4);
          expiry.value = digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
        });
      }
      if (cvv) cvv.addEventListener("input", () => { cvv.value = cvv.value.replace(/\D/g, "").slice(0, 4); });
    }

    function drawQr() {
      const target = $("#pix-qr");
      if (!target || !payment) return;
      if (window.QRCode) {
        target.innerHTML = "";
        new window.QRCode(target, { text: payment.pixCode, width: 180, height: 180 });
      } else {
        target.innerHTML = `<img alt="QR Code Pix" width="180" height="180" src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(payment.pixCode)}">`;
      }
    }

    function startCountdown() {
      clearInterval(timer);
      const label = $("#pay-countdown");
      if (!label || !payment || !payment.expiresAt) return;
      const end = new Date(payment.expiresAt).getTime();
      const tick = () => {
        const left = Math.max(0, end - Date.now());
        const minutes = String(Math.floor(left / 60000)).padStart(2, "0");
        const seconds = String(Math.floor((left % 60000) / 1000)).padStart(2, "0");
        label.textContent = left ? `${minutes}:${seconds}` : "expirado";
      };
      tick();
      timer = setInterval(tick, 1000);
    }

    function readCard() {
      return {
        number: $("#card-number").value,
        holder: $("#card-holder").value,
        expiry: $("#card-expiry").value,
        cvv: $("#card-cvv").value
      };
    }

    async function createPayment() {
      const button = $("#pay-button");
      if (button) button.disabled = true;
      say("Processando...", "loading");
      try {
        const isCard = method === "credit_card" || method === "debit_card";
        const body = isAcademy
          ? { institutionId, method, termsAccepted: true, termsVersion }
          : {
            planId: selected.plan.id,
            method,
            acceptPenalty: selected.penalty > 0,
            termsAccepted: true,
            termsVersion
          };
        if (isCard) {
          body.card = readCard();
          if (method === "credit_card") body.installments = Number($("#card-installments").value);
        }
        const response = await api.request(`${prefix}/simulate`, { method: "POST", body });
        payment = response.data;
        if (isCard) {
          await confirmPayment(payment.id);
          return;
        }
        say("Cobranca gerada. Finalize o pagamento abaixo.", "success");
        renderCheckout();
      } catch (error) {
        say(error.message, "error", error.details);
        if (button) button.disabled = false;
      }
    }

    async function confirmPayment(paymentId) {
      say("Confirmando pagamento...", "loading");
      try {
        await api.request(`${prefix}/${paymentId}/confirm`, { method: "POST" });
        let receipt = null;
        try { receipt = (await api.request(`${prefix}/${paymentId}/receipt`)).data; } catch (error) { /* opcional */ }
        clearInterval(timer);
        showSuccess(paymentId, receipt);
        say("", "info");
        await load();
      } catch (error) {
        say(error.message, "error", error.details);
      }
    }

    function showSuccess(paymentId, receipt) {
      checkout.hidden = false;
      checkout.innerHTML = `
        <div class="success-box">
          <div class="success-check"><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24"/><path d="M14 27l8 8 16-17"/></svg></div>
          <h2>Pagamento aprovado!</h2>
          <p>${html(selected.plan.name)} &middot; ${money(totalCents())} &middot; ${html(METHOD_NAMES[method] || method)}</p>
          ${receipt ? `<p class="muted-note">Protocolo: <strong>${html(receipt.receipt_code)}</strong></p>` : ""}
          <div class="button-row" style="justify-content:center;margin-top:16px;">
            <a class="btn-primary" style="width:auto;padding:12px 24px;display:inline-block;" href="comprovante?id=${paymentId}">Ver comprovante</a>
            <a class="btn-secondary" style="width:auto;padding:12px 24px;display:inline-block;" href="${isAcademy ? "gestao.html" : "agendar.html"}">${isAcademy ? "Ir para a gestao" : "Agendar uma aula"}</a>
          </div>
        </div>`;
      plansList.hidden = true;
      open = false;
      selected = null;
      payment = null;
      checkout.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    async function load() {
      const response = await api.request(isAcademy ? `/dojo/subscription?institutionId=${institutionId}` : "/access/me");
      state = response.data;
      renderCurrent();
    }

    // ---------- eventos ----------
    currentAccess.addEventListener("click", (event) => {
      if (event.target.closest("[data-toggle-plans]")) {
        setOpen(!open);
        if (open) renderPlans();
      }
    });

    plansList.addEventListener("click", (event) => {
      const button = event.target.closest("[data-plan-id]");
      if (!button) return;
      const plan = plans.find((item) => Number(item.id) === Number(button.dataset.planId));
      const fee = feeCents();
      const isCurrent = !isAcademy && state.planChange && Number(state.planChange.currentPlanId) === Number(plan.id);
      const penalty = fee > 0 && !isCurrent ? fee : 0;
      if (penalty > 0) {
        const ok = window.confirm(
          `Trocar de plano gera uma multa de ${money(penalty)} (${state.planChange.feePercent}% do plano atual ${state.planChange.currentPlanName}).\n\nO plano atual deixara de valer. Deseja continuar?`
        );
        if (!ok) return;
      }
      selected = { plan, penalty };
      payment = null;
      method = "pix";
      say("", "info");
      renderCheckout();
      checkout.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    checkout.addEventListener("click", async (event) => {
      const tab = event.target.closest("[data-method]");
      if (tab) { method = tab.dataset.method; renderCheckout(); return; }
      if (event.target.closest("#pay-button")) { createPayment(); return; }
      const confirm = event.target.closest("[data-confirm-payment]");
      if (confirm) { confirmPayment(confirm.dataset.confirmPayment); return; }
      const copy = event.target.closest("[data-copy]");
      if (copy) {
        try { await navigator.clipboard.writeText(copy.dataset.copy); copy.textContent = "Copiado!"; } catch (error) { /* sem permissao */ }
        return;
      }
      const cancel = event.target.closest("[data-cancel-payment]");
      if (cancel) {
        try { await api.request(`${prefix}/${cancel.dataset.cancelPayment}/cancel`, { method: "POST" }); } catch (error) { /* ignora */ }
        clearInterval(timer);
        payment = null;
        renderCheckout();
      }
    });

    say("Carregando...", "loading");
    try {
      await load();
      plans = (await api.request(isAcademy ? "/dojo/plans" : "/plans")).data;
      renderPlans();
      setOpen(false);
      say("", "info");
    } catch (error) {
      say(error.message, "error", error.details);
    }
  }

  window.FightPassPlanosAluno = { init };
})();
