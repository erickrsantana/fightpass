(function () {
  const api = window.FightPassApi;
  const HIDDEN_FIELDS = ["id", "created_at", "updated_at", "name", "slug", "code"];

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
    if (value === null || value === undefined || value === "") return "-";
    if (/cents$/.test(key)) return money(value);
    if (typeof value === "boolean" || value === 0 || value === 1) {
      if (/^(is_|has_)/.test(key)) return value ? "Sim" : "Nao";
    }
    return value;
  }

  function planCards(plans) {
    if (!plans.length) return `<div class="empty-state">Nenhum plano cadastrado.</div>`;
    return `<div class="metrics-grid">${plans.map((plan) => `
      <div class="card-white" style="border:1px solid #E2E8F0;">
        <h3 style="margin-bottom:10px;">${esc(plan.name || plan.slug || `Plano ${plan.id}`)}</h3>
        ${Object.keys(plan)
          .filter((key) => !HIDDEN_FIELDS.includes(key))
          .map((key) => `<p style="margin:4px 0; font-size:14px;"><span style="color:#64748B; text-transform:capitalize;">${esc(fieldLabel(key))}:</span> <strong>${esc(fieldValue(key, plan[key]))}</strong></p>`)
          .join("")}
      </div>
    `).join("")}</div>`;
  }

  async function init() {
    const user = await api.requireAuth(["platform_admin"]);
    if (!user) return;

    try {
      const response = await api.request("/platform/plans");
      $("#student-plans").innerHTML = planCards(response.data.studentPlans || []);
      $("#institution-plans").innerHTML = planCards(response.data.institutionPlans || []);
    } catch (error) {
      const message = $("#plans-message");
      message.className = "state-message error";
      message.textContent = error.message;
      message.hidden = false;
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();