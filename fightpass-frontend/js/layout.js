document.addEventListener("DOMContentLoaded", async function () {
  const body = document.body;
  const api = window.FightPassApi;

  if (!body.classList.contains("light-theme") || !body.classList.contains("app-shell")) {
    return;
  }

  const cachedUser = api ? api.getStoredUser() : null;
  const userName = cachedUser ? cachedUser.name : "Usuário";
  const userRole = cachedUser ? api.roleLabel(cachedUser.role) : "Sessão";
  const isPlatform = Boolean(cachedUser) && cachedUser.role === "platform_admin";
  const homeHref = isPlatform ? "plataforma.html" : "dashboard.html";

  const headerHTML = `
    <header class="top-header">
      <a class="header-logo" href="${homeHref}">FightPass</a>
      <div class="search-container"></div>
      <div class="user-profile-badge">
        <span class="user-name">${userName}</span>
        <span class="user-role">${userRole}</span>
      </div>
      <button class="logout-button" type="button" id="logout-button">Sair</button>
    </header>
  `;

  const sidebarHTML = `
    <nav class="sidebar">
      <a href="plataforma.html" class="nav-link" id="nav-p-home" data-roles="platform_admin">Home</a>
      <a href="mapa-plataforma.html" class="nav-link" id="nav-p-mapa" data-roles="platform_admin">Mapa</a>
      <a href="financeiro-plataforma.html" class="nav-link" id="nav-p-financeiro" data-roles="platform_admin">Financeiro</a>
      <a href="planos-plataforma.html" class="nav-link" id="nav-p-planos" data-roles="platform_admin">Planos</a>

      <a href="dashboard.html" class="nav-link" id="nav-home" data-roles="student,institution_admin">Home</a>
      <a href="mapa.html" class="nav-link" id="nav-mapa" data-roles="student,instructor,institution_admin">Mapa</a>
      <a href="agendar.html" class="nav-link" id="nav-agendar" data-roles="student">Agendar</a>
      <a href="minhas-aulas.html" class="nav-link" id="nav-aulas" data-roles="student">Minhas aulas</a>
      <a href="checkin.html" class="nav-link" id="nav-checkin" data-roles="student">Check-in</a>
      <a href="modalidades.html" class="nav-link" id="nav-modalidades" data-roles="instructor,institution_admin">Modalidades</a>
      <a href="gestao.html" class="nav-link" id="nav-gestao" data-roles="instructor,institution_admin">Gestão</a>
      <a href="avaliar-aluno.html" class="nav-link" id="nav-avaliar" data-roles="institution_admin">Avaliar aluno</a>
      <a href="financeiro.html" class="nav-link" id="nav-financeiro" data-roles="institution_admin">Financeiro</a>
      <a href="planos.html" class="nav-link" id="nav-planos" data-roles="student,institution_admin">Planos</a>

      <a href="perfil.html" class="nav-link" id="nav-perfil" data-roles="student,instructor,institution_admin,platform_admin">Perfil</a>
    </nav>
  `;

  body.insertAdjacentHTML("afterbegin", headerHTML + sidebarHTML);

  document.querySelectorAll("[data-roles]").forEach((link) => {
    const allowed = link.dataset.roles.split(",");
    link.hidden = !cachedUser || !allowed.includes(cachedUser.role);
  });

  const path = window.location.pathname;
  const navMap = {
    plataforma: "nav-p-home",
    "mapa-plataforma": "nav-p-mapa",
    "planos-plataforma": "nav-p-planos",
    "financeiro-plataforma": "nav-p-financeiro",
    dashboard: "nav-home",
    mapa: "nav-mapa",
    agendar: "nav-agendar",
    planos: "nav-planos",
    "minhas-aulas": "nav-aulas",
    checkin: "nav-checkin",
    gestao: "nav-gestao",
    modalidades: "nav-modalidades",
    financeiro: "nav-financeiro",
    "perfil-aluno": "nav-gestao",
    "avaliar-aluno": "nav-avaliar",
    perfil: "nav-perfil"
  };

 Object.keys(navMap).forEach((key) => {
    if (path.includes(key)) {
      const el = document.getElementById(navMap[key]);
      if (el) el.classList.add("active");
    }
  });

  const logoutButton = document.getElementById("logout-button");
  logoutButton.addEventListener("click", async () => {
    try {
      if (api && api.getToken()) {
        await api.request("/auth/logout", { method: "POST" });
      }
    } catch (error) {
      // O token local ainda deve ser removido mesmo que a API esteja indisponível.
    } finally {
      api.clearSession();
      api.setFlash("Logout realizado com sucesso.", "success");
      window.location.href = "login.html";
    }
  });
});

/* FIGHTPASS_FIRST_LOGIN_TERMS: exige o aceite dos Termos de Uso uma unica vez */
(function () {
  var page = (document.body && document.body.dataset.page) || "";
  if (!document.body || !document.body.classList.contains("app-shell")) return;
  if (["login", "cadastro", "register", "index"].indexOf(page) !== -1) return;
  function run() { if (window.FightPassTerms && window.FightPassTerms.firstLogin) window.FightPassTerms.firstLogin(); }
  if (window.FightPassTerms && window.FightPassTerms.firstLogin) return run();
  var s = document.createElement("script");
  s.src = "js/terms.js";
  s.onload = run;
  document.head.appendChild(s);
})();