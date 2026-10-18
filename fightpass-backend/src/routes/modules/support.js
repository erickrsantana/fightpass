const express = require("express");
const db = require("../../database/connection");
const { ApiError, asyncHandler, success, created, auth } = require("../../lib/http");
const { auditLog } = require("../../lib/business");

const router = express.Router();

const KINDS = ["reclamacao", "ajuda"];
const STATUSES = ["open", "in_progress", "resolved"];
const CATEGORIES = ["academia", "instrutor", "plano", "pagamento", "aula", "aplicativo", "outro"];

// Qualquer usuario logado abre um chamado (Reclame aqui ou Ajuda).
router.post(
  "/",
  auth(),
  asyncHandler(async (req, res) => {
    const kind = String(req.body.kind || "");
    const subject = String(req.body.subject || "").trim();
    const message = String(req.body.message || "").trim();
    const category = CATEGORIES.includes(req.body.category) ? req.body.category : "outro";

    if (!KINDS.includes(kind)) throw new ApiError(422, "Tipo de chamado invalido");
    if (subject.length < 3 || subject.length > 150) throw new ApiError(422, "O assunto deve ter de 3 a 150 caracteres");
    if (message.length < 10 || message.length > 2000) throw new ApiError(422, "A mensagem deve ter de 10 a 2000 caracteres");

    const result = await db.query(
      "INSERT INTO support_tickets (user_id, kind, category, subject, message) VALUES (?, ?, ?, ?, ?)",
      [req.user.sub, kind, category, subject, message]
    );
    await auditLog(req.user.sub, "support.create", "support_tickets", result.insertId, { kind });
    return created(res, { id: result.insertId }, "Chamado enviado com sucesso");
  })
);

// Meus chamados (com a resposta do FightPass).
router.get(
  "/mine",
  auth(),
  asyncHandler(async (req, res) => {
    const rows = await db.query(
      `SELECT id, kind, category, subject, message, status, response, responded_at, created_at
       FROM support_tickets WHERE user_id = ? ORDER BY id DESC LIMIT 100`,
      [req.user.sub]
    );
    return success(res, rows, "Chamados carregados com sucesso");
  })
);

// Caixa de entrada do FightPass.
router.get(
  "/inbox",
  auth(["platform_admin"]),
  asyncHandler(async (req, res) => {
    const where = [];
    const params = [];
    if (KINDS.includes(req.query.kind)) {
      where.push("t.kind = ?");
      params.push(req.query.kind);
    }
    if (STATUSES.includes(req.query.status)) {
      where.push("t.status = ?");
      params.push(req.query.status);
    }
    const rows = await db.query(
      `SELECT t.id, t.kind, t.category, t.subject, t.message, t.status, t.response, t.responded_at, t.created_at,
              u.id AS user_id, u.name AS user_name, u.email AS user_email, r.code AS user_role
       FROM support_tickets t
       INNER JOIN users u ON u.id = t.user_id
       INNER JOIN roles r ON r.id = u.role_id
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY FIELD(t.status, 'open', 'in_progress', 'resolved'), t.id DESC
       LIMIT 300`,
      params
    );
    return success(res, rows, "Chamados carregados com sucesso");
  })
);

// Responder / mudar status.
router.put(
  "/:id",
  auth(["platform_admin"]),
  asyncHandler(async (req, res) => {
    const ticketId = Number(req.params.id);
    const status = String(req.body.status || "");
    const response = String(req.body.response || "").trim();
    if (!STATUSES.includes(status)) throw new ApiError(422, "Status invalido");
    if (response.length > 2000) throw new ApiError(422, "Resposta muito longa");

    const found = await db.query("SELECT id FROM support_tickets WHERE id = ? LIMIT 1", [ticketId]);
    if (!found[0]) throw new ApiError(404, "Chamado nao encontrado");

    await db.query(
      `UPDATE support_tickets
       SET status = ?, response = ?, responded_by = ?, responded_at = IF(? = '', responded_at, NOW())
       WHERE id = ?`,
      [status, response || null, req.user.sub, response, ticketId]
    );
    await auditLog(req.user.sub, "support.update", "support_tickets", ticketId, { status });
    return success(res, { id: ticketId }, "Chamado atualizado");
  })
);

module.exports = router;
