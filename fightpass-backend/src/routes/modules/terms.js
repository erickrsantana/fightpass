const express = require("express");
const { body } = require("express-validator");
const { asyncHandler, success, validateRequest, auth } = require("../../lib/http");
const { getCurrentTerms, ensureTermsAccepted } = require("../../services/termsService");

const router = express.Router();

router.get(
  "/current",
  asyncHandler(async (req, res) => success(res, getCurrentTerms(), "Termos de Uso carregados com sucesso"))
);

router.post(
  "/accept",
  auth(),
  [
    body("termsAccepted").exists().withMessage("Aceite dos termos obrigatorio"),
    body("termsVersion").notEmpty().withMessage("Versao dos termos obrigatoria"),
    body("origin").isIn(["cadastro", "contratacao_plano"]).withMessage("Origem de aceite invalida")
  ],
  validateRequest,
  asyncHandler(async (req, res) => {
    const acceptance = await ensureTermsAccepted({
      userId: req.user.sub,
      accepted: req.body.termsAccepted,
      version: req.body.termsVersion,
      origin: req.body.origin,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"]
    });

    return success(res, acceptance, "Aceite dos Termos de Uso registrado com sucesso");
  })
);

module.exports = router;
