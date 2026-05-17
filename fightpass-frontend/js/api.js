(function () {
  const API_BASE_URL = localStorage.getItem("fightpass.apiBaseUrl") || "http://localhost:3000/api";
  const TOKEN_KEY = "fightpass.token";
  const USER_KEY = "fightpass.user";
  const FLASH_KEY = "fightpass.flash";

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function getStoredUser() {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || "null");
    } catch (error) {
      return null;
    }
  }

  function setFlash(message, type = "info") {
    localStorage.setItem(FLASH_KEY, JSON.stringify({ message, type }));
  }

  function consumeFlash() {
    const raw = localStorage.getItem(FLASH_KEY);
    if (!raw) return null;
    localStorage.removeItem(FLASH_KEY);
    try {
      return JSON.parse(raw);
    } catch (error) {
      return null;
    }
  }

  function saveSession(data) {
    if (data.token) localStorage.setItem(TOKEN_KEY, data.token);
    if (data.user) localStorage.setItem(USER_KEY, JSON.stringify(data.user));
  }

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  function roleLabel(role) {
    return {
      student: "Aluno",
      instructor: "Instrutor",
      institution_admin: "Administrador"
    }[role] || "Usuário";
  }

  function statusLabel(status) {
    return {
      active: "Ativo",
      inactive: "Inativo",
      trial: "Teste",
      expired: "Expirado",
      cancelled: "Cancelado",
      scheduled: "Agendada",
      confirmed: "Confirmada",
      missed: "Faltou",
      present: "Presente",
      absent: "Ausente",
      pending: "Pendente",
      paid: "Pago",
      used: "Usado",
      failed: "Falhou",
      manual: "Manual",
      overdue: "Em atraso"
    }[status] || status || "-";
  }

  function riskLabel(risk) {
    return {
      low: "Baixo",
      medium: "Médio",
      high: "Alto"
    }[risk] || risk || "-";
  }

  function geocodingStatusLabel(status) {
    return {
      pending: "Pendente",
      success: "Localizado",
      failed: "Falhou",
      manual: "Manual"
    }[status] || status || "-";
  }

  function firstInstitutionId(user) {
    return user && user.institutions && user.institutions[0] ? user.institutions[0].id : null;
  }

  function redirectByRole(user) {
    if (!user) {
      window.location.href = "login.html";
      return;
    }
    window.location.href = user.role === "student" ? "dashboard.html" : "gestao.html";
  }

  async function request(path, options = {}) {
    const headers = new Headers(options.headers || {});
    const body = options.body;

    if (body && !(body instanceof FormData)) {
      headers.set("Content-Type", "application/json");
    }

    const token = getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);

    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
      body: body && !(body instanceof FormData) ? JSON.stringify(body) : body
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch (error) {
      payload = { message: "Resposta inválida da API" };
    }

    if (!response.ok || payload.success === false) {
      if (response.status === 401) {
        clearSession();
      }
      const error = new Error(payload.message || "Não foi possível concluir a operação");
      error.status = response.status;
      error.details = payload.details || null;
      throw error;
    }

    return payload;
  }

  async function me() {
    const response = await request("/auth/me");
    localStorage.setItem(USER_KEY, JSON.stringify(response.data));
    return response.data;
  }

  async function requireAuth(roles) {
    if (!getToken()) {
      setFlash("Faça login para acessar esta tela.", "error");
      window.location.href = "login.html";
      return null;
    }

    let user = getStoredUser();
    try {
      user = await me();
    } catch (error) {
      setFlash("Sua sessão expirou. Entre novamente.", "error");
      window.location.href = "login.html";
      return null;
    }

    if (roles && !roles.includes(user.role)) {
      setFlash("Seu perfil não tem permissão para acessar esta tela.", "error");
      redirectByRole(user);
      return null;
    }

    return user;
  }

  function redirectIfAuthenticated() {
    const user = getStoredUser();
    if (getToken() && user) {
      redirectByRole(user);
    }
  }

  function formatDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return String(value).slice(0, 10).split("-").reverse().join("/");
    }
    return date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
  }

  function formatMonth(value) {
    if (!value) return "-";
    const date = new Date(value);
    return date.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
  }

  function dayLabel(day) {
    return ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][Number(day)] || "-";
  }

  function timeLabel(value) {
    return value ? String(value).slice(0, 5) : "-";
  }

  window.FightPassApi = {
    API_BASE_URL,
    request,
    login: (email, password) => request("/auth/login", { method: "POST", body: { email, password } }),
    register: (payload) => request("/auth/register", { method: "POST", body: payload }),
    forgotPassword: (email) => request("/auth/forgot-password", { method: "POST", body: { email } }),
    resetPassword: (token, password) => request("/auth/reset-password", { method: "POST", body: { token, password } }),
    me,
    requireAuth,
    redirectIfAuthenticated,
    saveSession,
    clearSession,
    getStoredUser,
    getToken,
    setFlash,
    consumeFlash,
    roleLabel,
    statusLabel,
    riskLabel,
    geocodingStatusLabel,
    firstInstitutionId,
    redirectByRole,
    formatDate,
    formatMonth,
    dayLabel,
    timeLabel
  };
})();
