(function () {
  const api = window.FightPassApi;

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

  function monthLabel(value) {
    const [year, month] = String(value).split("-");
    const names = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
    return `${names[Number(month) - 1]} de ${year}`;
  }

  async function init() {
    const user = await api.requireAuth(["instructor"]);
    if (!user) return;

    try {
      const response = await api.request("/payouts/me");
      const data = response.data;
      const current = data.items.find((item) => item.month === data.currentMonth);

      const cards = [
        ["Aulas dadas este mes", current ? current.lessons : 0],
        ["Previsto este mes", current && current.amountCents !== null ? money(current.amountCents) : "-"],
        ["Total recebido", money(data.receivedCents)],
        ["A receber", money(data.pendingCents)]
      ];
      $("#salary-cards").innerHTML = cards.map(([label, value]) => `
        <div class="card-white"><h3>${esc(label)}</h3><h2>${esc(value)}</h2></div>`).join("");

      $("#salary-table").innerHTML = data.items.length ? data.items.map((item) => `
        <tr>
          <td>${esc(monthLabel(item.month))}</td>
          <td>${esc(item.institutionName)}</td>
          <td>${item.lessons}</td>
          <td>${item.rateCents === null ? "A definir" : money(item.rateCents)}</td>
          <td>${item.amountCents === null ? "-" : money(item.amountCents)}</td>
          <td>${item.status === "paid"
            ? `<span class="tag tag-ok">Pago em ${esc(api.formatDate(item.paidAt))}</span><br><small>${esc(item.receiptCode)}</small>`
            : `<span class="tag tag-neutral">${item.rateCents === null ? "Valor nao definido" : "A receber"}</span>`}</td>
        </tr>`).join("") : `<tr><td colspan="6">Ainda nao ha aulas registradas.</td></tr>`;
    } catch (error) {
      const message = $("#salary-message");
      message.className = "state-message error";
      message.textContent = error.message;
      message.hidden = false;
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
