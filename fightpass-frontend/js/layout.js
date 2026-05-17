document.addEventListener("DOMContentLoaded", async function () {
  const body = document.body;
  const api = window.FightPassApi;

  if (!body.classList.contains("light-theme") || !body.classList.contains("app-shell")) {
    return;
  }

  const cachedUser = api ? api.getStoredUser() : null;
  const userName = cachedUser ? cachedUser.name : "Usuário";
  const userRole = cachedUser ? api.roleLabel(cachedUser.role) : "Sessão";

  const headerHTML = `
    <header class="top-header">
      <a class="header-logo" href="dashboard.html">FightPass</a>
      <div class="search-container">
        <input type="text" placeholder="Pesquisar academia, modalidade ou aluno" class="top-search">
      </div>
      <div class="user-profile-badge">
        <span class="user-name">${userName}</span>
        <span class="user-role">${userRole}</span>
      </div>
      <button class="logout-button" type="button" id="logout-button">Sair</button>
    </header>
  `;

  const sidebarHTML = `
    <nav class="sidebar">
      <a href="dashboard.html" class="nav-link" id="nav-home" data-roles="student,instructor,institution_admin">Home</a>
      <a href="mapa.html" class="nav-link" id="nav-mapa" data-roles="student">Mapa</a>
      <a href="agendar.html" class="nav-link" id="nav-agendar" data-roles="student">Agendar</a>
      <a href="planos.html" class="nav-link" id="nav-planos" data-roles="student,institution_admin">Planos</a>
      <a href="minhas-aulas.html" class="nav-link" id="nav-aulas" data-roles="student">Minhas aulas</a>
      <a href="checkin.html" class="nav-link" id="nav-checkin" data-roles="student">Check-in</a>
      <a href="gestao.html" class="nav-link" id="nav-gestao" data-roles="instructor,institution_admin">Gestão</a>
      <a href="avaliar-aluno.html" class="nav-link" id="nav-avaliar" data-roles="instructor,institution_admin">Avaliar aluno</a>
      <a href="perfil.html" class="nav-link" id="nav-perfil" data-roles="student,instructor,institution_admin">Perfil</a>
    </nav>
  `;

  body.insertAdjacentHTML("afterbegin", headerHTML + sidebarHTML);

  document.querySelectorAll("[data-roles]").forEach((link) => {
    const allowed = link.dataset.roles.split(",");
    link.hidden = !cachedUser || !allowed.includes(cachedUser.role);
  });

  const path = window.location.pathname;
  const navMap = {
    dashboard: "nav-home",
    mapa: "nav-mapa",
    agendar: "nav-agendar",
    planos: "nav-planos",
    "minhas-aulas": "nav-aulas",
    checkin: "nav-checkin",
    gestao: "nav-gestao",
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
