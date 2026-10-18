(function () {
  const api = window.FightPassApi;
  const HIDDEN_FIELDS = ["id", "created_at", "updated_at", "name", "slug", "code"];
  let data = { studentPlans: [], institutionPlans: [] };

  function $(selector) {
    return document.querySelector(selector);
  }

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function money(cents) {
    return (Number(cents) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function fieldLabel(key) {
    return key.replaceAll("_", " ");
  }

  function fieldValue(key, value) {
    if (value === null || value === undefined || value === "") return key === "session_limit" ? "Ilimitado" : "-";
    if (/cents$/.test(key)) return money(value);
    if (typeof value === "boolean" || value === 0 || value === 1) {
      if (/^(is_|has_)/.test(key)) return value ? "Sim" : "Nao";
    }
    return value;
  }

  function planCards(plans, kind) {
    if (!plans.length) return `<div class="empty-state">Nenhum plano cadastrado.</div>`;
    return `<div class="metrics-grid">${plans.map((plan) => `
      <div class="card-white" style="border:1px solid #E2E8F0;">
        <h3 style="margin-bottom:10px;">${esc(plan.name || plan.slug || `Plano ${plan.id}`)}</h3>
        ${Object.keys(plan)
          .filter((key) => !HIDDEN_FIELDS.includes(key))
          .map((key) => `<p style="margin:4px 0; font-size:14px;"><span style="color:#64748B; text-transform:capitalize;">${esc(fieldLabel(key))}:</span> <strong>${esc(fieldValue(key, plan[key]))}</strong></p>`)
          .join("")}
        <button type="button" class="btn-secondary" style="width:auto; padding:8px 18px; margin-top:12px;" data-edit="${kind}:${plan.id}">Editar</button>
      </div>
    `).join("")}</div>`;
  }

  function render() {
    $("#student-plans").innerHTML = planCards(data.studentPlans, "student");
    $("#institution-plans").innerHTML = planCards(data.institutionPlans, "institution");
  }

  function showMessage(message, type) {
    const element = $("#plans-message");
    element.className = `state-message ${type || "error"}`;
    element.textContent = message;
    element.hidden = !message;
  }

  function closeModal() {
    const overlay = $("#plan-overlay");
    if (overlay) overlay.remove();
    document.body.classList.remove("modal-open");
  }

  function openEditor(kind, id) {
    const list = kind === "student" ? data.studentPlans : data.institutionPlans;
    const plan = list.find((item) => Number(item.id) === Number(id));
    if (!plan) return;

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "plan-overlay";
    overlay.innerHTML = `
      <div class="modal-panel" role="dialog" aria-modal="true">
        <button type="button" class="modal-close" data-close aria-label="Fechar">&times;</button>
        <h2>Editar plano</h2>
        <p class="muted-note">O novo valor e os novos requisitos passam a valer para todos.</p>
        <form id="plan-form">
          <div class="input-group"><label>Nome</label><input name="name" class="input-field" maxlength="100" required value="${esc(plan.name)}"></div>
          <div class="input-group"><label>Descricao</label><input name="description" class="input-field" maxlength="255" required value="${esc(plan.description)}"></div>
          <div class="input-group"><label>Valor (R$)</label><input name="price" class="input-field" inputmode="decimal" required value="${esc((Number(plan.price_cents) / 100).toFixed(2).replace(".", ","))}"></div>
          ${kind === "student" ? `<div class="input-group"><label>Quantidade de treinos (vazio = ilimitado)</label><input name="sessionLimit" class="input-field" inputmode="numeric" value="${esc(plan.session_limit ?? "")}"></div>` : ""}
          <div class="input-group"><label>Validade (dias)</label><input name="durationDays" class="input-field" inputmode="numeric" required value="${esc(plan.duration_days)}"></div>
          <label class="inline-check"><input type="checkbox" name="isActive" ${plan.is_active ? "checked" : ""}><span>Plano ativo (aparece para contratacao)</span></label>
          <label class="inline-check"><input type="checkbox" name="applyToActive" checked><span>${kind === "student" ? "Aplicar tambem a quem ja usa este plano (treinos)" : "Aplicar o novo valor as mensalidades das academias"}</span></label>
          <div id="plan-form-message" class="state-message error" hidden></div>
          <div class="button-row" style="margin-top:16px;">
            <button type="submit" class="btn-primary" style="width:auto; padding:12px 32px;">Atualizar plano</button>
            <button type="button" class="btn-cancel" data-close>Cancelar</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(overlay);
    document.body.classList.add("modal-open");

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay || event.target.closest("[data-close]")) closeModal();
    });

    overlay.querySelector("#plan-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const box = overlay.querySelector("#plan-form-message");
      const rawPrice = String(form.price.value).trim();
      const normalizedPrice = rawPrice.includes(",") ? rawPrice.replace(/\./g, "").replace(",", ".") : rawPrice;
      const price = Math.round(parseFloat(normalizedPrice) * 100);
      if (!Number.isFinite(price) || price < 0) {
        box.textContent = "Valor invalido.";
        box.hidden = false;
        return;
      }
      const body = {
        name: form.name.value,
        description: form.description.value,
        priceCents: price,
        durationDays: Number(form.durationDays.value),
        isActive: form.isActive.checked,
        applyToActive: form.applyToActive.checked
      };
      if (kind === "student") {
        body.sessionLimit = form.sessionLimit.value.trim() === "" ? null : Number(form.sessionLimit.value);
      }
      try {
        const response = await api.request(`/platform/plans/${kind}/${plan.id}`, { method: "PUT", body });
        closeModal();
        showMessage(response.message, "success");
        await load();
      } catch (error) {
        box.textContent = error.message;
        box.hidden = false;
      }
    });
  }

  async function load() {
    const response = await api.request("/platform/plans");
    data = {
      studentPlans: response.data.studentPlans || [],
      institutionPlans: response.data.institutionPlans || []
    };
    render();
  }

  async function init() {
    const user = await api.requireAuth(["platform_admin"]);
    if (!user) return;

    document.addEventListener("click", (event) => {
      const button = event.target.closest("[data-edit]");
      if (!button) return;
      const [kind, id] = button.dataset.edit.split(":");
      openEditor(kind, id);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeModal();
    });

    try {
      await load();
    } catch (error) {
      showMessage(error.message, "error");
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
