(function () {
  const api = window.FightPassApi;

  const CATEGORIES = [
    ["academia", "Academia"], ["instrutor", "Instrutor"], ["plano", "Planos"], ["pagamento", "Pagamentos"],
    ["aula", "Aulas e agendamento"], ["aplicativo", "Aplicativo / erro"], ["outro", "Outro"]
  ];

  const FAQ = {
    student: [
      ["Como agendo uma aula?", "Entre em Agendar, filtre pela modalidade, escolha o horario e confirme. Voce precisa de um plano ativo."],
      ["Como troco de plano?", "Em Planos, clique em Alterar plano. Ao trocar um plano pago por outro, existe uma multa de 20% sobre o plano atual, mostrada antes de confirmar."],
      ["Como faco o check-in?", "Na tela Check-in, gere o QR Code da sua aula agendada e apresente ao instrutor."],
      ["Esqueci minha senha. E agora?", "Na tela de login, clique em Esqueci minha senha e siga as instrucoes."]
    ],
    instructor: [
      ["Como faco a chamada?", "Abra sua modalidade, encontre a aula do dia e marque cada aluno como presente ou ausente."],
      ["Quando recebo meu pagamento?", "No fim do mes, pelas aulas dadas. Quem paga e a academia onde voce trabalha."],
      ["Posso me cadastrar sozinho?", "Nao. O e-mail de instrutor e criado apenas pela academia."]
    ],
    institution_admin: [
      ["Como crio uma modalidade ou turma?", "Em Modalidades, crie a turma e escolha o instrutor responsavel. So ele faz a chamada dela."],
      ["Como cadastro um instrutor?", "Somente a academia cria o e-mail do instrutor, pela area de gestao."],
      ["Como vejo meu financeiro?", "Na tela Financeiro, com o repasse e a taxa da plataforma."]
    ],
    platform_admin: [
      ["Como respondo um chamado?", "Abra o chamado, escreva a resposta, escolha o status e salve. O usuario ve a resposta na propria conta."],
      ["Como altero o valor de um plano?", "Em Planos, clique em Editar. Marque a opcao de aplicar a todos para atualizar tambem quem ja usa o plano."]
    ]
  };

  const KIND_LABELS = { reclamacao: "Reclame aqui", ajuda: "Ajuda" };
  const STATUS_LABELS = { open: "Aberto", in_progress: "Em andamento", resolved: "Resolvido" };

  let user = null;
  let tab = "reclame";

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
    const element = $("#support-message");
    element.className = `state-message ${type || "error"}`;
    element.textContent = message;
    element.hidden = !message;
  }

  function dateTime(value) {
    if (!value) return "-";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
  }

  function statusTag(status) {
    const tone = status === "resolved" ? "ok" : status === "in_progress" ? "neutral" : "bad";
    return `<span class="tag tag-${tone}">${esc(STATUS_LABELS[status] || status)}</span>`;
  }

  function kindOfTab() {
    return tab === "ajuda" ? "ajuda" : "reclamacao";
  }

  function renderTabs() {
    $("#support-tabs").innerHTML = [["reclame", "Reclame aqui"], ["ajuda", "Ajuda"]].map(([key, label]) =>
      `<button type="button" class="tab-button ${tab === key ? "active" : ""}" data-tab="${key}">${label}</button>`
    ).join("");
    $("#support-title").textContent = tab === "ajuda" ? "Ajuda" : "Reclame aqui";
    $("#support-subtitle").textContent = tab === "ajuda"
      ? "Tire duvidas ou peca auxilio ao time do FightPass."
      : "Conte o que deu errado. O FightPass le e responde cada reclamacao.";
  }

  // ---------- usuario comum ----------
  function ticketCard(ticket) {
    return `
      <article class="ticket">
        <div class="ticket-head">
          <strong>${esc(ticket.subject)}</strong>
          ${statusTag(ticket.status)}
        </div>
        <small>${esc(KIND_LABELS[ticket.kind])} &middot; ${esc(ticket.category || "outro")} &middot; ${esc(dateTime(ticket.created_at))}</small>
        <p>${esc(ticket.message)}</p>
        ${ticket.response ? `<div class="ticket-response"><strong>Resposta do FightPass</strong><p>${esc(ticket.response)}</p><small>${esc(dateTime(ticket.responded_at))}</small></div>` : `<p class="muted-note">Ainda sem resposta.</p>`}
      </article>`;
  }

  async function renderUserView() {
    const kind = kindOfTab();
    const faq = (FAQ[user.role] || FAQ.student).map(([q, a]) => `
      <details class="faq-item"><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("");

    $("#support-content").innerHTML = `
      ${kind === "ajuda" ? `<section class="card-white" style="margin-top:20px;"><h2>Perguntas frequentes</h2>${faq}</section>` : ""}
      <section class="card-white" style="margin-top:20px;">
        <h2>${kind === "ajuda" ? "Pedir ajuda" : "Nova reclamacao"}</h2>
        <form id="support-form">
          <div class="input-group">
            <label for="support-category">Assunto relacionado</label>
            <select id="support-category" class="input-field">${CATEGORIES.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select>
          </div>
          <div class="input-group">
            <label for="support-subject">Titulo</label>
            <input id="support-subject" class="input-field" maxlength="150" required placeholder="Resuma em poucas palavras">
          </div>
          <div class="input-group">
            <label for="support-text">Mensagem</label>
            <textarea id="support-text" class="input-field" rows="5" maxlength="2000" required placeholder="Explique com detalhes (minimo de 10 caracteres)"></textarea>
          </div>
          <button type="submit" class="btn-primary" style="width:auto; padding:12px 32px;">Enviar</button>
        </form>
      </section>
      <section class="card-white" style="margin-top:20px;">
        <h2>Meus chamados</h2>
        <div class="scroll-box" id="support-mine"><div class="empty-state">Carregando...</div></div>
      </section>`;

    $("#support-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      showMessage("Enviando...", "loading");
      try {
        await api.request("/support", {
          method: "POST",
          body: {
            kind,
            category: $("#support-category").value,
            subject: $("#support-subject").value,
            message: $("#support-text").value
          }
        });
        event.target.reset();
        showMessage("Enviado! Voce acompanha a resposta aqui, em Meus chamados.", "success");
        loadMine();
      } catch (error) {
        showMessage(error.message, "error");
      }
    });
    loadMine();
  }

  async function loadMine() {
    try {
      const response = await api.request("/support/mine");
      const tickets = response.data.filter((t) => t.kind === kindOfTab());
      $("#support-mine").innerHTML = tickets.length ? tickets.map(ticketCard).join("") : `<div class="empty-state">Nenhum chamado ainda.</div>`;
    } catch (error) {
      $("#support-mine").innerHTML = `<div class="state-message error">${esc(error.message)}</div>`;
    }
  }

  // ---------- FightPass (caixa de entrada) ----------
  async function renderInboxView() {
    const kind = kindOfTab();
    $("#support-content").innerHTML = `
      <section class="card-white" style="margin-top:20px;">
        <div class="input-group" style="max-width:260px;">
          <label for="inbox-status">Filtrar por status</label>
          <select id="inbox-status" class="input-field">
            <option value="">Todos</option>
            <option value="open">Abertos</option>
            <option value="in_progress">Em andamento</option>
            <option value="resolved">Resolvidos</option>
          </select>
        </div>
        <div class="scroll-box" id="inbox-list"><div class="empty-state">Carregando...</div></div>
      </section>`;
    $("#inbox-status").addEventListener("change", loadInbox);
    loadInbox();
  }

  async function loadInbox() {
    const status = $("#inbox-status") ? $("#inbox-status").value : "";
    try {
      const params = new URLSearchParams({ kind: kindOfTab() });
      if (status) params.set("status", status);
      const response = await api.request(`/support/inbox?${params.toString()}`);
      const list = $("#inbox-list");
      if (!response.data.length) {
        list.innerHTML = `<div class="empty-state">Nenhum chamado.</div>`;
        return;
      }
      list.innerHTML = response.data.map((t) => `
        <article class="ticket" data-ticket="${t.id}">
          <div class="ticket-head">
            <strong>#${t.id} &middot; ${esc(t.subject)}</strong>
            ${statusTag(t.status)}
          </div>
          <small>${esc(t.user_name)} (${esc(api.roleLabel(t.user_role))}) &middot; ${esc(t.user_email)} &middot; ${esc(t.category || "outro")} &middot; ${esc(dateTime(t.created_at))}</small>
          <p>${esc(t.message)}</p>
          <div class="ticket-reply">
            <textarea class="input-field" rows="3" maxlength="2000" placeholder="Escreva a resposta">${esc(t.response || "")}</textarea>
            <div class="ticket-actions">
              <select class="input-field">
                ${Object.entries(STATUS_LABELS).map(([v, l]) => `<option value="${v}" ${t.status === v ? "selected" : ""}>${l}</option>`).join("")}
              </select>
              <button type="button" class="btn-primary" data-save="${t.id}" style="width:auto; padding:10px 24px;">Salvar</button>
            </div>
          </div>
        </article>`).join("");
    } catch (error) {
      $("#inbox-list").innerHTML = `<div class="state-message error">${esc(error.message)}</div>`;
    }
  }

  async function saveTicket(button) {
    const card = button.closest("[data-ticket]");
    showMessage("Salvando...", "loading");
    try {
      await api.request(`/support/${card.dataset.ticket}`, {
        method: "PUT",
        body: { status: card.querySelector("select").value, response: card.querySelector("textarea").value }
      });
      showMessage("Chamado atualizado.", "success");
      loadInbox();
    } catch (error) {
      showMessage(error.message, "error");
    }
  }

  function render() {
    renderTabs();
    showMessage("", "info");
    if (user.role === "platform_admin") renderInboxView();
    else renderUserView();
  }

  async function init() {
    user = await api.requireAuth();
    if (!user) return;
    tab = new URLSearchParams(window.location.search).get("tab") === "ajuda" ? "ajuda" : "reclame";

    $("#support-tabs").addEventListener("click", (event) => {
      const button = event.target.closest("[data-tab]");
      if (!button) return;
      tab = button.dataset.tab;
      history.replaceState(null, "", `suporte.html?tab=${tab}`);
      render();
    });
    $("#support-content").addEventListener("click", (event) => {
      const save = event.target.closest("[data-save]");
      if (save) saveTicket(save);
    });
    render();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
