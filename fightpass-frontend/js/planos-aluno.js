(function () {
  const api = window.FightPassApi;

  const $ = (selector) => document.querySelector(selector);
  const html = (value) => String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  const money = (cents) => (Number(cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

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

  async function init() {
    const currentAccess = $("#current-access");
    const plansList = $("#plans-list");
    const paymentResult = $("#payment-result");
    const methodSelect = $("#payment-method");
    const methodSection = methodSelect ? methodSelect.closest("section") : null;
    const termsBox = $("#plans-terms");
    if (termsBox) termsBox.hidden = true;

    const picker = [methodSection, plansList];
    let open = false;
    let state = null;
    let termsVersion = null;

    function setOpen(value) {
      open = value;
      picker.forEach((el) => { if (el) el.hidden = !open; });
      renderCurrent();
    }

    try {
      const terms = await api.request("/terms/current");
      termsVersion = terms.data.version;
    } catch (error) { /* o servidor valida de qualquer forma */ }

    function feeCents() {
      return state && state.planChange ? Number(state.planChange.feeCents) || 0 : 0;
    }

    function renderCurrent() {
      if (!state) return;
      const access = state.access;
      const toggle = `<button type="button" data-toggle-plans style="background:none;border:none;color:#64748B;text-decoration:underline;cursor:pointer;font-size:13px;padding:0;">${open ? "Fechar" : (state.hasActiveAccess ? "Alterar plano" : "Ver planos")}</button>`;
      if (!state.hasActiveAccess || !access) {
        currentAccess.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
            <div>
              <h2 style="font-size:18px;margin-bottom:6px;">Seu plano</h2>
              <p style="color:#991B1B;">Você não possui plano ativo.</p>
            </div>
            ${toggle}
          </div>`;
        return;
      }
      const remaining = access.sessions_total === null || access.sessions_total === undefined
        ? "Ilimitado"
        : `${Math.max(0, access.sessions_total - access.sessions_used)} treino(s)`;
      const planName = access.plan_name || access.name || (state.planChange && state.planChange.currentPlanName) || "Plano ativo";
      currentAccess.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
          <div>
            <h2 style="font-size:18px;margin-bottom:6px;">Seu plano</h2>
            <p><strong>${html(planName)}</strong></p>
            <p style="color:#64748B;">Válido até ${api.formatDate(access.expires_at)} | Restam: ${html(remaining)}</p>
          </div>
          ${toggle}
        </div>
        ${open && feeCents() > 0 ? `
          <p style="margin-top:12px;padding:10px 14px;border-radius:10px;background:#FFF7ED;color:#9A3412;font-size:14px;">
            Trocar para outro plano enquanto este está em uso gera uma multa de <strong>${money(feeCents())}</strong>
            (${html(state.planChange.feePercent)}% do plano atual), cobrada junto com o novo plano.
          </p>` : ""}`;
    }

    function renderPlans(plans) {
      const fee = feeCents();
      const currentId = state.planChange ? state.planChange.currentPlanId : null;
      plansList.innerHTML = plans.map((plan) => {
        const isCurrent = currentId && Number(currentId) === Number(plan.id);
        const label = isCurrent ? "Renovar" : (fee > 0 ? `Trocar (+ multa ${money(fee)})` : "Contratar");
        return `
          <article class="card-white" style="display:flex;flex-direction:column;gap:12px;${isCurrent ? "outline:2px solid #2A78D6;" : ""}">
            <h2 style="font-size:20px;">${html(plan.name)}${isCurrent ? ' <small style="color:#2A78D6;font-size:12px;">plano atual</small>' : ""}</h2>
            <p style="color:#64748B;min-height:54px;">${html(plan.description)}</p>
            <strong style="font-size:28px;color:var(--primary-blue);">${money(plan.priceCents)}</strong>
            ${plan.features && plan.features.length ? `<ul class="plan-features">${plan.features.map((f) => `<li>${html(f)}</li>`).join("")}</ul>` : ""}
            <button class="btn-primary" type="button" data-plan-id="${plan.id}" data-plan-name="${html(plan.name)}">${label}</button>
          </article>`;
      }).join("");
    }

    function renderPayment(p) {
      paymentResult.hidden = false;
      const summary = `
        <p style="color:#64748B;">Plano ${money(p.basePriceCents)}${p.penaltyCents > 0 ? ` + multa de troca ${money(p.penaltyCents)}` : ""}</p>
        <p style="font-size:20px;margin:6px 0 12px;"><strong>Total: ${money(p.amountCents)}</strong></p>`;
      let body = "";
      if (p.method === "pix") {
        body = `<div class="qr-frame" style="display:inline-block;margin:12px 0;"><img alt="QR Code Pix fictício" style="width:200px;height:200px;" src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(p.pixCode)}"></div><div class="token-box">${html(p.pixCode)}</div>`;
      } else if (p.method === "boleto") {
        body = `<div class="token-box">${html(p.boletoCode)}</div>`;
      } else {
        body = `<div class="token-box">${html(p.referenceCode)}</div>`;
      }
      paymentResult.innerHTML = `
        <h2 style="font-size:18px;margin-bottom:8px;">Pagamento gerado</h2>
        ${summary}
        <p style="color:#64748B;">${html(p.prototypeNotice)}</p>
        ${body}
        <div><button class="btn-primary" style="width:auto;margin-top:16px;padding:12px 24px;" data-confirm-payment="${p.id}">Confirmar pagamento fictício</button></div>`;
    }

    async function load() {
      const response = await api.request("/access/me");
      state = response.data;
      renderCurrent();
    }

    currentAccess.addEventListener("click", (event) => {
      if (event.target.closest("[data-toggle-plans]")) setOpen(!open);
    });

    plansList.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-plan-id]");
      if (!button) return;
      const fee = feeCents();
      const isCurrent = state.planChange && Number(state.planChange.currentPlanId) === Number(button.dataset.planId);
      const needsPenalty = fee > 0 && !isCurrent;
      if (needsPenalty) {
        const ok = window.confirm(
          `Trocar de plano gera uma multa de ${money(fee)} (${state.planChange.feePercent}% do plano atual ${state.planChange.currentPlanName}).\n\nO plano atual deixará de valer. Deseja continuar?`
        );
        if (!ok) return;
      }
      say("Gerando cobrança fictícia...", "loading");
      try {
        const response = await api.request("/payments/simulate", {
          method: "POST",
          body: {
            planId: Number(button.dataset.planId),
            method: methodSelect.value,
            acceptPenalty: needsPenalty,
            termsAccepted: true,
            termsVersion
          }
        });
        renderPayment(response.data);
        say(response.message, "success");
        paymentResult.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch (error) {
        say(error.message, "error", error.details);
      }
    });

    paymentResult.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-confirm-payment]");
      if (!button) return;
      say("Confirmando pagamento fictício...", "loading");
      try {
        const response = await api.request(`/payments/${button.dataset.confirmPayment}/confirm`, { method: "POST" });
        say(response.message, "success");
        paymentResult.hidden = true;
        await load();
        setOpen(false);
      } catch (error) {
        say(error.message, "error", error.details);
      }
    });

    say("Carregando...", "loading");
    try {
      await load();
      const plans = await api.request("/plans");
      renderPlans(plans.data);
      setOpen(false);
      say("", "info");
    } catch (error) {
      say(error.message, "error", error.details);
    }
  }

  window.FightPassPlanosAluno = { init };
})();