(function () {
  const api = window.FightPassApi;
  const $ = (s) => document.querySelector(s);
  const html = (v) => String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  const money = (c) => (Number(c || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const METHODS = { pix: "Pix", boleto: "Boleto", credit_card: "Credito", debit_card: "Debito", transfer: "Transferencia" };
  const STATUS = {
    paid: ["Pago", "tag-ok"], pending: ["Pendente", "tag-neutral"],
    cancelled: ["Cancelado", "tag-bad"], canceled: ["Cancelado", "tag-bad"],
    expired: ["Expirado", "tag-bad"], failed: ["Recusado", "tag-bad"]
  };

  async function init() {
    const user = await api.requireAuth(["student", "institution_admin"]);
    if (!user) return;
    const message = $("#pay-message");
    try {
      const response = await api.request(user.role === "institution_admin" ? `/dojo/payments/mine?institutionId=${api.firstInstitutionId(user)}` : "/payments/mine");
      const { payments, totals } = response.data;
      $("#pay-totals").innerHTML = `
        <div class="card-white stat"><small>Total pago</small><strong>${money(totals.paidCents)}</strong></div>
        <div class="card-white stat"><small>Pagamentos aprovados</small><strong>${totals.paidCount}</strong></div>
        <div class="card-white stat"><small>Multas de troca</small><strong>${money(totals.penaltyCents)}</strong></div>`;
      $("#pay-rows").innerHTML = payments.length ? payments.map((p) => {
        const [label, css] = STATUS[p.status] || [p.status, "tag-neutral"];
        const method = (METHODS[p.method] || p.method)
          + (p.card_last4 ? ` ${html(p.card_brand || "")} •••• ${html(p.card_last4)}` : "")
          + (p.installments > 1 ? ` (${p.installments}x)` : "");
        return `<tr>
          <td>${api.formatDate(p.paid_at || p.created_at)}</td>
          <td>${html(p.plan_name)}</td>
          <td>${method}</td>
          <td>${money(p.amount_cents)}</td>
          <td><span class="tag ${css}">${html(label)}</span></td>
          <td>${p.status === "paid" ? `<a href="comprovante?id=${p.id}">Comprovante</a>` : ""}</td>
        </tr>`;
      }).join("") : `<tr><td colspan="6" class="muted-note">Voce ainda nao fez nenhum pagamento. <a href="planos.html">Ver planos</a></td></tr>`;
    } catch (error) {
      message.hidden = false;
      message.className = "state-message error";
      message.textContent = error.message;
    }
  }
  document.addEventListener("DOMContentLoaded", init);
})();
