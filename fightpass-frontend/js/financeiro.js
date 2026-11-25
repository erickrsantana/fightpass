(function () {
  const api = window.FightPassApi;

  function $(selector) {
    return document.querySelector(selector);
  }

  function html(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatCurrency(cents) {
    return (Number(cents || 0) / 100).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL"
    });
  }

  function setMessage(message, type) {
    const element = $("#finance-message");
    if (!element) return;
    element.className = `state-message ${type || "info"}`;
    element.textContent = message || "";
    element.hidden = !message;
  }

  function dateLabel(value) {
    return String(value).slice(0, 10).split("-").reverse().join("/");
  }

  function monthDefault() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }

  const statusLabels = {
    realized: "Aula realizada",
    forecast: "Previsto",
    absent: "Aluno ausente",
    no_checkin: "Sem presença registrada"
  };

  async function init() {
    const user = await api.requireAuth(["institution_admin"]);
    if (!user) return;

    const institutionId = api.firstInstitutionId(user);
    if (!institutionId) {
      setMessage("Este usuário não está vinculado a uma instituição ativa.", "error");
      return;
    }

    const monthInput = $("#finance-month");
    const cards = $("#finance-cards");
    const table = $("#finance-table");
    const note = $("#finance-note");
    const payout = $("#finance-payout");

    function render(data) {
      const totals = data.totals;
      const cardStyle = "padding: 20px;";
      const labelStyle = "color: #64748B; font-size: 14px; font-weight: 600;";
      const valueStyle = "font-size: 24px; font-weight: 700; margin-top: 5px;";
      cards.innerHTML = `
        <div class="card-white" style="${cardStyle}">
          <span style="${labelStyle}">Você vai receber</span>
          <div style="${valueStyle} color: #10B981;">${formatCurrency(totals.realizedNetCents)}</div>
          <small style="color:#64748B;">${totals.realizedLessons} aula(s) realizada(s)</small>
        </div>
        <div class="card-white" style="${cardStyle}">
          <span style="${labelStyle}">Previsto (aulas agendadas)</span>
          <div style="${valueStyle} color: #3B82F6;">${formatCurrency(totals.forecastNetCents)}</div>
          <small style="color:#64748B;">${totals.forecastLessons} aula(s) ainda não realizada(s)</small>
        </div>
        <div class="card-white" style="${cardStyle}">
          <span style="${labelStyle}">Valor bruto das aulas</span>
          <div style="${valueStyle} color: #1E293B;">${formatCurrency(totals.realizedGrossCents)}</div>
          <small style="color:#64748B;">Pago pelos alunos</small>
        </div>
        <div class="card-white" style="${cardStyle}">
          <span style="${labelStyle}">Taxa FightPass (${html(data.feePercent)}%)</span>
          <div style="${valueStyle} color: #EF4444;">${formatCurrency(totals.realizedFeeCents)}</div>
          <small style="color:#64748B;">Descontada do bruto</small>
        </div>
      `;

      payout.textContent = `Repasse previsto para ${dateLabel(data.payoutDate)}`;
      note.textContent = `Cada aluno paga um plano FightPass. O valor de cada aula é o preço do plano dividido pelo número de treinos dele. Quando o aluno treina na sua academia e a presença é registrada, esse valor entra para você, já descontada a taxa de ${data.feePercent}% do FightPass. Aulas agendadas e ainda não realizadas aparecem como previsto.`;

      table.innerHTML = data.entries.length ? data.entries.map((entry) => `
        <tr>
          <td>${dateLabel(entry.date)}</td>
          <td>${html(entry.studentName)}</td>
          <td>${html(entry.modalityName)} - ${html(entry.classTitle)}</td>
          <td>${html(entry.planName)}</td>
          <td>${formatCurrency(entry.grossCents)}</td>
          <td>${formatCurrency(entry.feeCents)}</td>
          <td><strong>${formatCurrency(entry.netCents)}</strong></td>
          <td>${html(statusLabels[entry.status] || entry.status)}</td>
        </tr>
      `).join("") : `<tr><td colspan="8">Nenhum lançamento neste mês.</td></tr>`;
    }

    async function load() {
      setMessage("Carregando financeiro...", "loading");
      try {
        const response = await api.request(`/finance/institution/${institutionId}?month=${encodeURIComponent(monthInput.value)}`);
        render(response.data);
        setMessage("", "info");
      } catch (error) {
        setMessage(error.message, "error");
      }
    }

    monthInput.value = monthDefault();
    monthInput.addEventListener("change", load);
    await load();
  }

  document.addEventListener("DOMContentLoaded", init);
})();