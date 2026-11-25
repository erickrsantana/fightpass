const express = require("express");
const env = require("../../config/env");
const { asyncHandler, success } = require("../../lib/http");
const { verifyMercadoPagoSignature } = require("../../lib/security");
const { processMercadoPagoPayment } = require("../../services/paymentActivationService");

const router = express.Router();

// Publico: o frontend descobre se deve mostrar o pagamento real ou o simulado.
router.get("/payments/config", (req, res) =>
  success(res, { mode: env.payments.mode }, "Configuração de pagamentos")
);

// Webhook do Mercado Pago. Nunca confia no corpo: valida a assinatura e consulta o pagamento na API.
router.post(
  "/payments/webhook/mercadopago",
  asyncHandler(async (req, res) => {
    if (env.payments.mode !== "gateway") return res.status(200).json({ success: true });

    const dataId = String((req.query["data.id"] || (req.body && req.body.data && req.body.data.id) || "")).toLowerCase();
    const type = String(req.query.type || (req.body && req.body.type) || "");

    if (env.payments.mercadoPagoWebhookSecret) {
      const ok = verifyMercadoPagoSignature({
        signatureHeader: req.headers["x-signature"],
        requestId: req.headers["x-request-id"],
        dataId,
        secret: env.payments.mercadoPagoWebhookSecret
      });
      if (!ok) return res.status(401).json({ success: false, message: "Assinatura inválida" });
    } else if (env.isProduction) {
      return res.status(503).json({ success: false, message: "Webhook sem segredo configurado" });
    }

    if (type === "payment" && /^\d{1,20}$/.test(dataId)) {
      try {
        await processMercadoPagoPayment(dataId);
      } catch (error) {
        console.error("Webhook Mercado Pago falhou:", error.message);
        return res.status(500).json({ success: false }); // MP tenta de novo
      }
    }
    return res.status(200).json({ success: true });
  })
);

module.exports = router;
