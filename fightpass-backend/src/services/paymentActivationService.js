const db = require("../database/connection");
const { ApiError } = require("../lib/http");
const { auditLog } = require("../lib/business");
const { makeReceiptCode } = require("../lib/cardPayments");
const { getPayment } = require("../lib/mercadopago");

// ---------------------------------------------------------------------------
// Aluno: ativa o plano de uma cobranca paga.
//  - studentId informado = fluxo simulado (o aluno confirma a propria cobranca).
//  - gateway = true      = chamado pelo webhook depois de o Mercado Pago aprovar.
// ---------------------------------------------------------------------------
async function activateStudentPayment({ paymentId, studentId = null, gateway = false, gatewayPaymentId = null }) {
  const connection = await db.pool.getConnection();

  try {
    await connection.beginTransaction();
    // FOR UPDATE: duas notificacoes simultaneas do gateway nao ativam o plano duas vezes.
    const [paymentRows] = await connection.execute(
      `SELECT ps.id, ps.student_id, ps.plan_id, ps.status, ps.method, ps.terms_acceptance_id, ps.penalty_cents, ps.expires_at,
              ap.code, ap.name, ap.price_cents, ap.session_limit, ap.duration_days
       FROM payment_simulations ps
       INNER JOIN access_plans ap ON ap.id = ps.plan_id
       WHERE ps.id = ? ${studentId ? "AND ps.student_id = ?" : ""}
       LIMIT 1
       FOR UPDATE`,
      studentId ? [paymentId, studentId] : [paymentId]
    );

    const payment = paymentRows[0];
    if (!payment) throw new ApiError(404, "Cobranca nao encontrada");

    if (!gateway && payment.method === "gateway") {
      throw new ApiError(403, "Esta cobranca so e confirmada pelo gateway de pagamento");
    }
    if (payment.status === "paid") {
      if (gateway) { await connection.commit(); return { paymentId: payment.id, alreadyPaid: true }; }
      throw new ApiError(409, "Cobranca ja confirmada");
    }
    // Gateway: aceita tambem cobranca cancelada na tela (o cliente pode ter pago depois de cancelar).
    if (payment.status !== "pending" && !(gateway && payment.status === "cancelled")) {
      throw new ApiError(409, "Cobranca nao esta pendente");
    }

    if (!gateway && payment.expires_at && new Date(payment.expires_at) < new Date()) {
      await connection.execute("UPDATE payment_simulations SET status = 'cancelled' WHERE id = ?", [payment.id]);
      await connection.commit();
      throw new ApiError(410, "Cobranca expirada. Gere uma nova para continuar.");
    }
    if (!payment.terms_acceptance_id) {
      throw new ApiError(422, "Termos de Uso nao foram aceitos para esta contratacao");
    }

    const [passResult] = await connection.execute(
      `INSERT INTO student_access_passes
         (student_id, plan_id, source, status, starts_at, expires_at, sessions_total, sessions_used)
       VALUES (?, ?, 'payment', 'active', NOW(), DATE_ADD(NOW(), INTERVAL ? DAY), ?, 0)`,
      [payment.student_id, payment.plan_id, payment.duration_days, payment.session_limit]
    );

    // Troca com multa: o plano pago anterior deixa de valer.
    if (Number(payment.penalty_cents) > 0) {
      await connection.execute(
        `UPDATE student_access_passes
         SET status = 'cancelled'
         WHERE student_id = ? AND source = 'payment' AND status = 'active' AND id <> ?`,
        [payment.student_id, passResult.insertId]
      );
    }

    await connection.execute(
      `UPDATE payment_simulations
       SET status = 'paid', paid_at = NOW(), access_pass_id = ?, receipt_code = ?,
           gateway_payment_id = COALESCE(?, gateway_payment_id), gateway_status = IF(? IS NULL, gateway_status, 'approved')
       WHERE id = ?`,
      [passResult.insertId, makeReceiptCode(payment.id), gatewayPaymentId, gatewayPaymentId, payment.id]
    );

    await auditLog(payment.student_id, gateway ? "payments.gateway_approved" : "payments.confirm", "payment_simulations", payment.id, {
      accessPassId: passResult.insertId,
      penaltyCents: Number(payment.penalty_cents) || 0,
      gatewayPaymentId,
      prototype: !gateway
    }, connection);

    await connection.commit();
    return { paymentId: payment.id, accessPassId: passResult.insertId };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// ---------------------------------------------------------------------------
// Webhook do Mercado Pago: valida o pagamento direto na API deles e so entao libera o acesso.
// ---------------------------------------------------------------------------
async function processMercadoPagoPayment(mpPaymentId) {
  const mp = await getPayment(mpPaymentId);
  const reference = String(mp.external_reference || "");
  const match = /^(S|D)-(\d+)$/.exec(reference);
  if (!match) return { ignored: "external_reference desconhecida" };

  const kind = match[1];
  const id = Number(match[2]);
  const table = kind === "S" ? "payment_simulations" : "dojo_payment_simulations";

  const rows = await db.query(`SELECT id, amount_cents, status, method FROM ${table} WHERE id = ? LIMIT 1`, [id]);
  const row = rows[0];
  if (!row || row.method !== "gateway") return { ignored: "cobranca nao encontrada" };

  await db.query(`UPDATE ${table} SET gateway_status = ?, gateway_payment_id = COALESCE(gateway_payment_id, ?) WHERE id = ? AND status = 'pending'`, [
    String(mp.status || "").slice(0, 30), String(mp.id), id
  ]);

  if (mp.status === "approved") {
    // Confere valor e moeda: impede liberar um plano de R$99 com um pagamento de R$1.
    const paidCents = Math.round(Number(mp.transaction_amount) * 100);
    if (mp.currency_id !== "BRL" || paidCents !== Number(row.amount_cents)) {
      console.error(`[mercadopago] valor divergente na cobranca ${reference}: esperado ${row.amount_cents}, recebido ${paidCents} ${mp.currency_id}`);
      return { ignored: "valor divergente" };
    }
    if (kind === "S") return activateStudentPayment({ paymentId: id, gateway: true, gatewayPaymentId: String(mp.id) });
    const { activateDojoPayment } = require("./dojoSubscriptionService");
    return activateDojoPayment({ paymentId: id, gateway: true, gatewayPaymentId: String(mp.id) });
  }

  // Recusado/pendente: mantemos a cobranca pendente (o cliente pode tentar de novo no mesmo checkout).
  return { status: mp.status };
}

module.exports = {
  activateStudentPayment,
  processMercadoPagoPayment
};
