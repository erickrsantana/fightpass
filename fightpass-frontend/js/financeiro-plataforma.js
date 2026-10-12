(function () {
  const api = window.FightPassApi;

  // Paleta: azul e laranja (categorias 1 e 2), cinza para grade e textos.
  const BLUE = "#2A78D6";
  const ORANGE = "#EB6834";
  const AQUA = "#1BAF7A";
  const SURFACE = "#FFFFFF";
  const GRID = "#E2E8F0";
  const INK = "#475569";

  const MONTHS_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const METHOD_LABELS = { pix: "Pix", boleto: "Boleto", credit_card: "Cartao de credito", debit_card: "Cartao de debito", transfer: "Transferencia" };

  const charts = {};
  let currentMonths = 6;

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

  function monthLabel(key) {
    const [year, month] = key.split("-").map(Number);
    return `${MONTHS_PT[month - 1]}/${String(year).slice(2)}`;
  }

  function dateLabel(value) {
    return value ? String(value).slice(0, 10).split("-").reverse().join("/") : "-";
  }

  function showMessage(message) {
    const element = $("#fin-message");
    element.className = "state-message error";
    element.textContent = message;
    element.hidden = !message;
  }

  function drawChart(id, config) {
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart($(`#${id}`), config);
  }

  const baseOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { backgroundColor: "#0F172A", padding: 10, titleColor: "#FFFFFF", bodyColor: "#FFFFFF" }
    }
  };

  function renderCards(data) {
    const totals = data.totals;
    const cards = [
      ["Receita do mes", money(totals.monthRevenueCents), BLUE, `Previsto ainda neste mes: ${money(totals.monthForecastCents)}`],
      ["Receita no periodo", money(totals.periodRevenueCents), BLUE, `Taxa de ${data.feePercent}% + mensalidades + multas`],
      ["Pago pelos alunos", money(totals.periodStudentGrossCents), "#10b981", "Volume total dos planos pagos"],
      ["Ticket medio do aluno", money(totals.averageTicketCents), BLUE, "Valor medio por pagamento"],
      ["Mensalidades ativas", money(totals.recurringDojoCents), ORANGE, `${totals.activeSubscriptions} academia(s) com plano ativo`],
      ["Novos neste mes", `${totals.newStudentsMonth} alunos`, "#10b981", `${totals.newInstitutionsMonth} academia(s) nova(s)`]
    ];
    $("#fin-cards").innerHTML = cards.map(([label, value, color, hint]) => `
      <div class="card-white">
        <h3>${esc(label)}</h3>
        <h2 style="color:${color}">${esc(value)}</h2>
        <p class="fin-note">${esc(hint)}</p>
      </div>
    `).join("");
  }

  function renderRevenue(data) {
    const labels = data.months.map(monthLabel);
    drawChart("chart-revenue", {
      type: "bar",
      data: {
        labels,
        datasets: [
          { label: "Taxa sobre as aulas", data: data.series.feeRealized.map((v) => v / 100), backgroundColor: BLUE, borderColor: SURFACE, borderWidth: 2, borderRadius: 4, maxBarThickness: 44, stack: "receita" },
          { label: "Mensalidades das academias", data: data.series.dojo.map((v) => v / 100), backgroundColor: ORANGE, borderColor: SURFACE, borderWidth: 2, borderRadius: 4, maxBarThickness: 44, stack: "receita" },
          { label: "Multas de troca de plano", data: data.series.penalties.map((v) => v / 100), backgroundColor: AQUA, borderColor: SURFACE, borderWidth: 2, borderRadius: 4, maxBarThickness: 44, stack: "receita" }
        ]
      },
      options: {
        ...baseOptions,
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { color: INK } },
          y: { stacked: true, beginAtZero: true, grid: { color: GRID }, border: { display: false }, ticks: { color: INK, callback: (v) => money(v * 100) } }
        },
        plugins: {
          ...baseOptions.plugins,
          tooltip: { ...baseOptions.plugins.tooltip, callbacks: { label: (ctx) => `${ctx.dataset.label}: ${money(ctx.parsed.y * 100)}` } }
        }
      }
    });

    $("#table-revenue").innerHTML = `
      <thead><tr><th>Mes</th><th class="num">Taxa sobre aulas</th><th class="num">Mensalidades</th><th class="num">Multas</th><th class="num">Total</th></tr></thead>
      <tbody>${data.months.map((month, index) => `
        <tr>
          <td>${esc(monthLabel(month))}</td>
          <td class="num">${esc(money(data.series.feeRealized[index]))}</td>
          <td class="num">${esc(money(data.series.dojo[index]))}</td>
          <td class="num">${esc(money(data.series.penalties[index]))}</td>
          <td class="num"><strong>${esc(money(data.series.revenue[index]))}</strong></td>
        </tr>`).join("")}
      </tbody>`;
  }

  function renderSignups(data) {
    const labels = data.months.map(monthLabel);
    const lineStyle = { borderWidth: 2, pointRadius: 4, pointHoverRadius: 6, pointBackgroundColor: SURFACE, pointBorderWidth: 2, tension: 0.25 };
    drawChart("chart-signups", {
      type: "line",
      data: {
        labels,
        datasets: [
          { ...lineStyle, label: "Alunos", data: data.series.newStudents, borderColor: BLUE, pointBorderColor: BLUE },
          { ...lineStyle, label: "Academias", data: data.series.newInstitutions, borderColor: ORANGE, pointBorderColor: ORANGE }
        ]
      },
      options: {
        ...baseOptions,
        interaction: { mode: "index", intersect: false },
        scales: {
          x: { grid: { display: false }, ticks: { color: INK } },
          y: { beginAtZero: true, grid: { color: GRID }, border: { display: false }, ticks: { color: INK, precision: 0 } }
        }
      }
    });

    $("#table-signups").innerHTML = `
      <thead><tr><th>Mes</th><th class="num">Alunos</th><th class="num">Academias</th></tr></thead>
      <tbody>${data.months.map((month, index) => `
        <tr>
          <td>${esc(monthLabel(month))}</td>
          <td class="num">${esc(data.series.newStudents[index])}</td>
          <td class="num">${esc(data.series.newInstitutions[index])}</td>
        </tr>`).join("")}
      </tbody>`;
  }

  function horizontalBars(id, labels, values, formatter) {
    drawChart(id, {
      type: "bar",
      data: {
        labels,
        datasets: [{ data: values, backgroundColor: BLUE, borderRadius: 4, maxBarThickness: 22 }]
      },
      options: {
        ...baseOptions,
        indexAxis: "y",
        scales: {
          x: { beginAtZero: true, grid: { color: GRID }, border: { display: false }, ticks: { color: INK, precision: 0, callback: (v) => formatter(v) } },
          y: { grid: { display: false }, ticks: { color: INK } }
        },
        plugins: {
          ...baseOptions.plugins,
          tooltip: { ...baseOptions.plugins.tooltip, callbacks: { label: (ctx) => formatter(ctx.parsed.x) } }
        }
      }
    });
  }

  function renderInstitutions(data) {
    if (!data.byInstitution.length) {
      if (charts["chart-institutions"]) charts["chart-institutions"].destroy();
      const canvas = $("#chart-institutions");
      canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
      canvas.parentElement.insertAdjacentHTML("beforeend", `<p class="fin-note" data-empty>Ainda nao ha aulas realizadas neste periodo.</p>`);
      return;
    }
    document.querySelectorAll("[data-empty]").forEach((node) => node.remove());
    horizontalBars(
      "chart-institutions",
      data.byInstitution.map((item) => item.name),
      data.byInstitution.map((item) => item.feeCents / 100),
      (value) => money(value * 100)
    );
  }

  function renderPlans(data) {
    horizontalBars(
      "chart-plans",
      data.plans.map((item) => item.name),
      data.plans.map((item) => item.total),
      (value) => `${Math.round(value)}`
    );
  }

  function renderPayments(data) {
    const rows = data.recentPayments;
    $("#table-payments").innerHTML = rows.length ? `
      <thead><tr><th>Data</th><th>Tipo</th><th>Pagador</th><th>Plano</th><th>Forma</th><th class="num">Valor</th></tr></thead>
      <tbody>${rows.map((row) => `
        <tr>
          <td>${esc(dateLabel(row.date))}</td>
          <td>${esc(row.kind)}</td>
          <td>${esc(row.payer)}</td>
          <td>${esc(row.item)}</td>
          <td>${esc(METHOD_LABELS[row.method] || row.method)}</td>
          <td class="num">${esc(money(row.amountCents))}</td>
        </tr>`).join("")}
      </tbody>` : `<tbody><tr><td>Nenhum pagamento recebido ainda.</td></tr></tbody>`;
  }

  async function load() {
    showMessage("");
    try {
      const response = await api.request(`/platform/finance?months=${currentMonths}`);
      const data = response.data;
      renderCards(data);
      renderRevenue(data);
      renderSignups(data);
      renderInstitutions(data);
      renderPlans(data);
      renderPayments(data);
    } catch (error) {
      showMessage(error.message);
    }
  }

  async function init() {
    const user = await api.requireAuth(["platform_admin"]);
    if (!user) return;

    $("#fin-periods").addEventListener("click", (event) => {
      const button = event.target.closest("[data-months]");
      if (!button) return;
      currentMonths = Number(button.dataset.months);
      document.querySelectorAll("#fin-periods button").forEach((item) => item.classList.toggle("active", item === button));
      load();
    });

    load();
  }

  document.addEventListener("DOMContentLoaded", init);
})();