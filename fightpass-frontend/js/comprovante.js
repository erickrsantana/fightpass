(function () {
  const api = window.FightPassApi;
  const $ = (s) => document.querySelector(s);
  const html = (v) => String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  const money = (c) => (Number(c || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const METHODS = { pix: "Pix", boleto: "Boleto", credit_card: "Cartao de credito", debit_card: "Cartao de debito", transfer: "Transferencia" };

  async function init() {
    const user = await api.requireAuth(["student", "institution_admin"]);
    if (!user) return;
    $("#print-receipt").addEventListener("click", () => window.print());
    let id = new URLSearchParams(window.location.search).get("id");
    const message = $("#receipt-message");
    try {
      if (!id) {
        // O numero se perdeu (redirecionamento): abre o comprovante do ultimo pagamento pago.
        const isAcademy = user.role === "institution_admin";
        const list = await api.request(isAcademy
          ? `/dojo/payments/mine?institutionId=${api.firstInstitutionId(user)}`
          : "/payments/mine");
        const lastPaid = (list.data.payments || []).find((item) => item.status === "paid");
        if (!lastPaid) throw new Error("Nenhum pagamento confirmado encontrado.");
        id = lastPaid.id;
      }
      const r = (await api.request(`${user.role === "institution_admin" ? "/dojo" : ""}/payments/${encodeURIComponent(id)}/receipt`)).data;
      const card = r.card_last4 ? ` ${html(r.card_brand || "")} final ${html(r.card_last4)}` : "";
      const planCents = Number(r.amount_cents) - Number(r.penalty_cents || 0);
      $("#receipt").hidden = false;
      $("#receipt").innerHTML = `
        <div class="receipt-head"><strong>FightPass</strong><span>Comprovante de pagamento</span></div>
        <div class="receipt-status">✓ Pagamento aprovado</div>
        <dl>
          <dt>Protocolo</dt><dd>${html(r.receipt_code)}</dd>
          <dt>Data</dt><dd>${api.formatDate(r.paid_at)}</dd>
          <dt>${user.role === "institution_admin" ? "Academia" : "Aluno"}</dt><dd>${html(r.student_name)}${r.student_document ? ` &middot; ${user.role === "institution_admin" ? "CNPJ" : "CPF"} ${html(r.student_document)}` : ""}</dd>
          <dt>Plano</dt><dd>${html(r.plan_name)} &middot; ${user.role === "institution_admin" ? "mensalidade da plataforma" : (r.session_limit ? `${r.session_limit} treinos` : "treinos ilimitados")} &middot; ${r.duration_days} dias</dd>
          <dt>Forma</dt><dd>${html(METHODS[r.method] || r.method)}${card}${r.installments > 1 ? ` em ${r.installments}x de ${money(Math.ceil(r.amount_cents / r.installments))}` : ""}</dd>
          <dt>Valor do plano</dt><dd>${money(planCents)}</dd>
          ${Number(r.penalty_cents) > 0 ? `<dt>Multa de troca</dt><dd>${money(r.penalty_cents)}</dd>` : ""}
          <dt>Total pago</dt><dd class="receipt-total">${money(r.amount_cents)}</dd>
        </dl>
        <p class="muted-note">Pagamento simulado para fins de demonstracao academica.</p>`;
    } catch (error) {
      message.hidden = false;
      message.className = "state-message error";
      message.textContent = error.message;
    }
  }
  document.addEventListener("DOMContentLoaded", init);
})();
