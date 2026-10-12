(function () {
  const api = window.FightPassApi;

  const ROLE_LABELS = {
    student: "Alunos",
    instructor: "Instrutores",
    institution_admin: "Gestores de academia",
    staff: "Equipe de apoio",
    platform_admin: "Equipe FightPass"
  };

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

  function showMessage(message, type) {
    const element = $("#platform-message");
    element.className = `state-message ${type || "error"}`;
    element.textContent = message;
    element.hidden = !message;
  }

  async function init() {
    const user = await api.requireAuth(["platform_admin"]);
    if (!user) return;

    try {
      const response = await api.request("/platform/overview");
      const data = response.data;
      const byRole = Object.fromEntries(data.roles.map((item) => [item.role, item.total]));

      const cards = [
        ["Usuarios cadastrados", data.totalUsers, "var(--primary-blue)"],
        ["Alunos", byRole.student || 0, "#10b981"],
        ["Gestores de academia", byRole.institution_admin || 0, "var(--primary-blue)"],
        ["Instrutores", byRole.instructor || 0, "var(--primary-blue)"],
        ["Academias ativas", data.institutions.active, "#10b981"],
        ["Novos em 30 dias", data.newUsersLast30Days, "var(--primary-blue)"]
      ];

      $("#platform-metrics").innerHTML = cards.map(([label, value, color]) => `
        <div class="card-white">
          <h3>${esc(label)}</h3>
          <h2 style="color: ${color}">${esc(value)}</h2>
        </div>
      `).join("");

      $("#platform-roles").innerHTML = `
        <table class="table" style="width:100%;">
          <thead><tr><th style="text-align:left;">Tipo de conta</th><th style="text-align:right;">Contas ativas</th></tr></thead>
          <tbody>
            ${data.roles.map((item) => `
              <tr>
                <td>${esc(ROLE_LABELS[item.role] || item.name)}</td>
                <td style="text-align:right;">${esc(item.total)}</td>
              </tr>
            `).join("")}
            <tr>
              <td><strong>Total</strong></td>
              <td style="text-align:right;"><strong>${esc(data.totalUsers)}</strong></td>
            </tr>
          </tbody>
        </table>
        <p style="color:#64748B; margin-top:10px; font-size:14px;">Contam apenas contas ativas. Academias cadastradas: ${esc(data.institutions.total)}.</p>
      `;
    } catch (error) {
      showMessage(error.message, "error");
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();