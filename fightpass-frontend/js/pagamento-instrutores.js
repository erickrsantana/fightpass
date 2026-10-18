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

  function say(message, type) {
    const element = $("#payout-message");
    element.className = `state-message ${type || "info"}`;
    element.textContent = message || "";
    element.hidden = !message;
  }

  async function init() {
    const user = await api.requireAuth(["institution_admin"]);
    if (!user || !$("#payout-table")) return;
    const institutionId = api.firstInstitutionId(user);
    if (!institutionId) return;
    const monthInput = $("#finance-month");

    function month() {
      const now = new Date();
      return (monthInput && monthInput.value) || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    }

    async function load() {
      try {
        const response = await api.request(`/payouts/instructors?institutionId=${institutionId}&month=${month()}`);
        const data = response.data;
        $("#payout-table").innerHTML = data.items.length ? data.items.map((item) => `
          <tr>
            <td>${esc(item.name)}<br><small>${esc(item.email)}</small></td>
            <td>${item.lessons}</td>
            <td>
              <input class="input-field" style="max-width:110px; display:inline-block;" inputmode="decimal" data-rate-input="${item.id}"
                     value="${item.rateCents === null ? "" : (item.rateCents / 100).toFixed(2).replace(".", ",")}" placeholder="0,00" ${item.payout ? "disabled" : ""}>
              ${item.payout ? "" : `<button type="button" class="btn-secondary" style="width:auto; padding:8px 12px;" data-save-rate="${item.id}">Salvar</button>`}
            </td>
            <td>${item.amountCents === null ? "-" : money(item.amountCents)}</td>
            <td>${item.payout
              ? `<span class="tag tag-ok">Pago em ${esc(api.formatDate(item.payout.paid_at))}</span><br><small>${esc(item.payout.receipt_code)}</small>`
              : `<button type="button" class="btn-primary" style="width:auto; padding:8px 16px;" data-pay="${item.id}" ${!item.amountCents ? "disabled" : ""}>Pagar ${item.amountCents ? money(item.amountCents) : ""}</button>`}</td>
          </tr>`).join("") : `<tr><td colspan="5">Nenhum instrutor cadastrado. Crie em Gestao.</td></tr>`;
        $("#payout-totals").textContent = `A pagar neste mes: ${money(data.totals.pendingCents)} | Ja pago: ${money(data.totals.paidCents)}`;
      } catch (error) {
        say(error.message, "error");
      }
    }

    $("#payout-table").addEventListener("click", async (event) => {
      const saveButton = event.target.closest("[data-save-rate]");
      const payButton = event.target.closest("[data-pay]");
      try {
        if (saveButton) {
          const id = saveButton.dataset.saveRate;
          const raw = String($(`[data-rate-input="${id}"]`).value).trim();
          const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
          const cents = Math.round(parseFloat(normalized) * 100);
          if (!Number.isFinite(cents) || cents < 0) {
            say("Valor por aula invalido.", "error");
            return;
          }
          await api.request(`/payouts/instructors/${id}/rate`, { method: "PUT", body: { institutionId, rateCents: cents } });
          say("Valor por aula salvo.", "success");
          await load();
        }
        if (payButton) {
          if (!window.confirm("Confirmar o pagamento ao instrutor? (simulacao)")) return;
          const response = await api.request(`/payouts/instructors/${payButton.dataset.pay}/pay`, {
            method: "POST",
            body: { institutionId, month: month(), method: "pix" }
          });
          say(`${response.message}. Comprovante ${response.data.receiptCode}`, "success");
          await load();
        }
      } catch (error) {
        say(error.message, "error");
      }
    });

    if (monthInput) monthInput.addEventListener("change", load);
    // O financeiro.js define o mes padrao; aguarda um instante para ler o valor.
    setTimeout(load, 300);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
