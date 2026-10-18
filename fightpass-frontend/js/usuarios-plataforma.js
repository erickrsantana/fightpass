(function () {
  const api = window.FightPassApi;

  const TABS = [
    ["", "Todos"],
    ["student", "Alunos"],
    ["instructor", "Instrutores"],
    ["institution_admin", "Academias"],
    ["platform_admin", "FightPass"]
  ];

  const state = { role: "student", q: "", counts: {} };
  let searchTimer = null;

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
    return (Number(cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function idLabel(id) {
    return `#${String(id).padStart(4, "0")}`;
  }

  function initials(name) {
    return String(name || "FP").trim().split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase() || "FP";
  }

  function dateTime(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return api.formatDate(value);
    return date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
  }

  function showMessage(message, type) {
    const element = $("#users-message");
    element.className = `state-message ${type || "error"}`;
    element.textContent = message;
    element.hidden = !message;
  }

  const STATUS_LABELS = {
    active: "Ativo", inactive: "Inativo", trial: "Teste", expired: "Expirado", cancelled: "Cancelado",
    pending: "Pendente", paid: "Pago", scheduled: "Agendada", confirmed: "Confirmada",
    present: "Presente", absent: "Ausente", payment: "Pagamento", admin: "Admin"
  };

  function statusTag(value) {
    const label = STATUS_LABELS[value] || value || "-";
    const tone = ["active", "paid", "present", "confirmed"].includes(value) ? "ok"
      : ["cancelled", "absent", "expired", "inactive"].includes(value) ? "bad" : "neutral";
    return `<span class="tag tag-${tone}">${esc(label)}</span>`;
  }

  function renderTabs() {
    $("#users-tabs").innerHTML = TABS.map(([role, label]) => {
      const total = role ? state.counts[role] : Object.values(state.counts).reduce((sum, n) => sum + n, 0);
      return `<button type="button" class="tab-button ${state.role === role ? "active" : ""}" data-role="${role}">${esc(label)} <span class="tab-count">${total ?? 0}</span></button>`;
    }).join("");
  }

  function renderList(users) {
    if (!users.length) {
      $("#users-list").innerHTML = `<div class="empty-state">Nenhum usuario encontrado.</div>`;
      $("#users-count").textContent = "";
      return;
    }
    $("#users-list").innerHTML = `
      <table class="table scroll-table">
        <thead>
          <tr><th>ID</th><th>Nome</th><th>E-mail</th><th>Tipo</th><th>Status</th><th>Cadastro</th></tr>
        </thead>
        <tbody>
          ${users.map((u) => `
            <tr class="click-row" data-user="${u.id}">
              <td><strong>${idLabel(u.id)}</strong></td>
              <td><span class="mini-avatar">${esc(initials(u.name))}</span> ${esc(u.name)}</td>
              <td>${esc(u.email)}</td>
              <td>${esc(api.roleLabel(u.role))}</td>
              <td>${statusTag(u.is_active ? "active" : "inactive")}</td>
              <td>${esc(api.formatDate(u.created_at))}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>`;
    $("#users-count").textContent = `${users.length} usuario(s) exibido(s). Clique em uma linha para abrir a ficha.`;
  }

  async function loadUsers() {
    try {
      const params = new URLSearchParams();
      if (state.role) params.set("role", state.role);
      if (state.q) params.set("q", state.q);
      const response = await api.request(`/platform/users?${params.toString()}`);
      state.counts = response.data.counts || {};
      renderTabs();
      renderList(response.data.users || []);
      showMessage("", "info");
    } catch (error) {
      showMessage(error.message, "error");
    }
  }

  function section(title, content) {
    return `<section class="ficha-section"><h3>${esc(title)}</h3>${content}</section>`;
  }

  function miniTable(headers, rows, empty) {
    if (!rows.length) return `<p class="muted-note">${esc(empty)}</p>`;
    return `<div class="scroll-box small"><table class="table"><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((cells) => `<tr>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }

  function renderFicha(data) {
    const u = data.user;
    const avatar = u.avatar_url && /^(https?:\/\/|data:image\/)/.test(u.avatar_url)
      ? `<img src="${esc(u.avatar_url)}" alt="Foto de ${esc(u.name)}">`
      : `<span>${esc(initials(u.name))}</span>`;

    let html = `
      <div class="ficha-head">
        <div class="avatar-xl">${avatar}</div>
        <div>
          <h2>${esc(u.name)}</h2>
          <p class="muted-note">${idLabel(u.id)} &middot; ${esc(api.roleLabel(u.role))} &middot; ${statusTag(u.is_active ? "active" : "inactive")}</p>
        </div>
      </div>
      ${section("Dados", `
        <div class="ficha-grid">
          <div><small>E-mail</small><strong>${esc(u.email)}</strong></div>
          <div><small>Telefone</small><strong>${esc(u.phone || "-")}</strong></div>
          <div><small>CPF/CNPJ</small><strong>${esc(u.document || "-")}</strong></div>
          <div><small>Genero</small><strong>${esc(api.genderLabel ? api.genderLabel(u.gender) : u.gender || "-")}</strong></div>
          <div><small>Cadastro</small><strong>${esc(api.formatDate(u.created_at))}</strong></div>
        </div>`)}`;

    if (data.institutions && data.institutions.length) {
      html += section("Academias vinculadas", `<p>${data.institutions.map((i) => `${esc(i.name)} <small>(${esc(api.roleLabel(i.role))})</small>`).join(" &middot; ")}</p>`);
    }

    if (data.ownedInstitutions) {
      html += section("Academias que administra", miniTable(
        ["ID", "Academia", "Status", "Alunos"],
        data.ownedInstitutions.map((i) => [idLabel(i.id), esc(i.name), statusTag(i.status), esc(i.students_count)]),
        "Nenhuma academia cadastrada."
      ));
    }

    if (u.role === "student") {
      const s = data.summary || { bookings: 0, present: 0 };
      html += section("Resumo", `
        <div class="ficha-grid">
          <div><small>Aulas agendadas</small><strong>${s.bookings}</strong></div>
          <div><small>Presencas</small><strong>${s.present}</strong></div>
        </div>`);
      html += section("Planos contratados", miniTable(
        ["Plano", "Origem", "Status", "Validade", "Treinos"],
        data.passes.map((p) => [esc(p.plan_name), statusTag(p.source), statusTag(p.status), esc(api.formatDate(p.expires_at)),
          p.sessions_total === null ? "Ilimitado" : `${p.sessions_used}/${p.sessions_total}`]),
        "Nenhum plano."
      ));
      html += section("Pagamentos", miniTable(
        ["Plano", "Metodo", "Valor", "Multa", "Status", "Data"],
        data.payments.map((p) => [esc(p.plan_name), esc(api.paymentMethodLabel ? api.paymentMethodLabel(p.method) : p.method), money(p.amount_cents),
          p.penalty_cents ? money(p.penalty_cents) : "-", statusTag(p.status), esc(api.formatDate(p.paid_at || p.created_at))]),
        "Nenhum pagamento."
      ));
      html += section("Matriculas", miniTable(
        ["Academia", "Modalidade", "Status", "Desde"],
        data.enrollments.map((e) => [esc(e.institution_name), esc(e.modality_name), statusTag(e.status), esc(api.formatDate(e.started_at))]),
        "Nenhuma matricula."
      ));
      html += section("Ultimas aulas", miniTable(
        ["Data", "Aula", "Academia", "Agendamento", "Presenca"],
        data.bookings.map((b) => [esc(api.formatDate(b.booking_date)), esc(b.title || b.modality_name), esc(b.institution_name), statusTag(b.status),
          b.attendance_status ? statusTag(b.attendance_status) : "-"]),
        "Nenhuma aula agendada."
      ));
      html += section("Avaliacoes", miniTable(
        ["Data", "Academia", "Modalidade", "Nota", "Comentario"],
        data.evaluations.map((v) => [esc(api.formatDate(v.created_at)), esc(v.institution_name), esc(v.modality_name), esc(v.score), esc(v.comment || "-")]),
        "Nenhuma avaliacao."
      ));
    }
    return html;
  }

  async function openFicha(userId) {
    const overlay = $("#ficha-overlay");
    $("#ficha-body").innerHTML = `<div class="empty-state">Carregando ficha...</div>`;
    overlay.hidden = false;
    document.body.classList.add("modal-open");
    try {
      const response = await api.request(`/platform/users/${userId}`);
      $("#ficha-body").innerHTML = renderFicha(response.data);
    } catch (error) {
      $("#ficha-body").innerHTML = `<div class="state-message error">${esc(error.message)}</div>`;
    }
  }

  function closeFicha() {
    $("#ficha-overlay").hidden = true;
    document.body.classList.remove("modal-open");
  }

  async function init() {
    const user = await api.requireAuth(["platform_admin"]);
    if (!user) return;

    $("#users-tabs").addEventListener("click", (event) => {
      const button = event.target.closest("[data-role]");
      if (!button) return;
      state.role = button.dataset.role;
      loadUsers();
    });

    $("#users-search").addEventListener("input", (event) => {
      clearTimeout(searchTimer);
      const value = event.target.value.trim();
      searchTimer = setTimeout(() => {
        state.q = value;
        loadUsers();
      }, 300);
    });

    $("#users-list").addEventListener("click", (event) => {
      const row = event.target.closest("[data-user]");
      if (row) openFicha(row.dataset.user);
    });

    $("#ficha-close").addEventListener("click", closeFicha);
    $("#ficha-overlay").addEventListener("click", (event) => {
      if (event.target.id === "ficha-overlay") closeFicha();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeFicha();
    });

    renderTabs();
    loadUsers();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
