const crypto = require("crypto");
const express = require("express");
const db = require("../../database/connection");
const { ApiError, asyncHandler, success, auth } = require("../../lib/http");
const { auditLog, ensureInstitutionAccess } = require("../../lib/business");

const router = express.Router();

function pad(value) {
  return String(value).padStart(2, "0");
}

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
}

function parseMonth(value) {
  const reference = value && /^\d{4}-\d{2}$/.test(value) ? value : currentMonth();
  const [year, month] = reference.split("-").map(Number);
  if (month < 1 || month > 12) throw new ApiError(422, "Mes invalido. Use o formato AAAA-MM");
  const lastDay = new Date(year, month, 0).getDate();
  return { reference, start: `${reference}-01`, end: `${reference}-${pad(lastDay)}` };
}

function receiptCode(payoutKey) {
  const now = new Date();
  return `FP-REP-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${String(payoutKey).padStart(5, "0")}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
}

// Aulas dadas = aulas (turma + dia) em que o professor responsavel fez a chamada.
async function countLessons(institutionId, instructorId, start, end) {
  const rows = await db.query(
    `SELECT COUNT(*) AS lessons FROM (
       SELECT DISTINCT b.class_schedule_id, b.booking_date
       FROM attendances a
       INNER JOIN bookings b ON b.id = a.booking_id
       INNER JOIN class_schedules cs ON cs.id = b.class_schedule_id
       INNER JOIN classes c ON c.id = cs.class_id
       WHERE c.institution_id = ? AND c.instructor_id = ?
         AND b.booking_date BETWEEN ? AND ?
     ) lessons`,
    [institutionId, instructorId, start, end]
  );
  return Number(rows[0].lessons);
}

// Academia: instrutores, aulas dadas e valor a pagar no mes.
router.get(
  "/instructors",
  auth(["institution_admin"]),
  asyncHandler(async (req, res) => {
    const institutionId = Number(req.query.institutionId);
    if (!Number.isInteger(institutionId) || institutionId <= 0) throw new ApiError(422, "Instituicao invalida");
    await ensureInstitutionAccess(req.user.sub, institutionId, ["institution_admin"]);
    const period = parseMonth(req.query.month);

    const instructors = await db.query(
      `SELECT u.id, u.name, u.email, iu.lesson_rate_cents, iu.status
       FROM institution_user iu
       INNER JOIN users u ON u.id = iu.user_id
       WHERE iu.institution_id = ? AND iu.membership_role = 'instructor'
       ORDER BY iu.status, u.name`,
      [institutionId]
    );
    const payouts = await db.query(
      `SELECT id, instructor_id, lessons_count, rate_cents, amount_cents, method, receipt_code, paid_at
       FROM instructor_payouts WHERE institution_id = ? AND reference_month = ?`,
      [institutionId, period.reference]
    );

    const items = [];
    for (const instructor of instructors) {
      const payout = payouts.find((row) => Number(row.instructor_id) === Number(instructor.id)) || null;
      const lessons = payout ? payout.lessons_count : await countLessons(institutionId, instructor.id, period.start, period.end);
      const rate = payout ? payout.rate_cents : instructor.lesson_rate_cents;
      items.push({
        id: instructor.id,
        name: instructor.name,
        email: instructor.email,
        status: instructor.status,
        lessons,
        rateCents: rate === null ? null : Number(rate),
        amountCents: rate === null ? null : lessons * Number(rate),
        payout
      });
    }

    return success(res, {
      month: period.reference,
      items,
      totals: {
        pendingCents: items.filter((item) => !item.payout && item.amountCents).reduce((sum, item) => sum + item.amountCents, 0),
        paidCents: items.filter((item) => item.payout).reduce((sum, item) => sum + Number(item.payout.amount_cents), 0)
      }
    }, "Pagamentos de instrutores carregados com sucesso");
  })
);

// Academia: define quanto paga por aula dada.
router.put(
  "/instructors/:id/rate",
  auth(["institution_admin"]),
  asyncHandler(async (req, res) => {
    const institutionId = Number(req.body.institutionId);
    const rate = Number(req.body.rateCents);
    if (!Number.isInteger(institutionId) || institutionId <= 0) throw new ApiError(422, "Instituicao invalida");
    if (!Number.isInteger(rate) || rate < 0 || rate > 10000000) throw new ApiError(422, "Valor por aula invalido");
    await ensureInstitutionAccess(req.user.sub, institutionId, ["institution_admin"]);

    const result = await db.query(
      `UPDATE institution_user SET lesson_rate_cents = ?
       WHERE institution_id = ? AND user_id = ? AND membership_role = 'instructor'`,
      [rate, institutionId, req.params.id]
    );
    if (!result.affectedRows) throw new ApiError(404, "Instrutor nao encontrado nesta academia");
    await auditLog(req.user.sub, "payouts.set_rate", "users", Number(req.params.id), { institutionId, rate });
    return success(res, { id: Number(req.params.id), rateCents: rate }, "Valor por aula atualizado");
  })
);

// Academia: paga o instrutor (simulado). Cai na conta do professor e gera comprovante.
router.post(
  "/instructors/:id/pay",
  auth(["institution_admin"]),
  asyncHandler(async (req, res) => {
    const institutionId = Number(req.body.institutionId);
    const instructorId = Number(req.params.id);
    const method = ["pix", "transfer"].includes(req.body.method) ? req.body.method : "pix";
    if (!Number.isInteger(institutionId) || institutionId <= 0) throw new ApiError(422, "Instituicao invalida");
    await ensureInstitutionAccess(req.user.sub, institutionId, ["institution_admin"]);
    const period = parseMonth(req.body.month);

    const members = await db.query(
      `SELECT lesson_rate_cents FROM institution_user
       WHERE institution_id = ? AND user_id = ? AND membership_role = 'instructor' LIMIT 1`,
      [institutionId, instructorId]
    );
    if (!members[0]) throw new ApiError(404, "Instrutor nao encontrado nesta academia");
    if (members[0].lesson_rate_cents === null) throw new ApiError(409, "Defina o valor por aula antes de pagar");

    const existing = await db.query(
      "SELECT id FROM instructor_payouts WHERE institution_id = ? AND instructor_id = ? AND reference_month = ? LIMIT 1",
      [institutionId, instructorId, period.reference]
    );
    if (existing[0]) throw new ApiError(409, "Este mes ja foi pago para este instrutor");

    const lessons = await countLessons(institutionId, instructorId, period.start, period.end);
    const rate = Number(members[0].lesson_rate_cents);
    const amount = lessons * rate;
    if (amount <= 0) throw new ApiError(409, "Nao ha aulas dadas neste mes para pagar");

    const code = receiptCode(instructorId);
    const insert = await db.query(
      `INSERT INTO instructor_payouts
         (institution_id, instructor_id, reference_month, lessons_count, rate_cents, amount_cents, method, receipt_code, paid_by, paid_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [institutionId, instructorId, period.reference, lessons, rate, amount, method, code, req.user.sub]
    );
    await auditLog(req.user.sub, "payouts.pay", "instructor_payouts", insert.insertId, {
      institutionId, instructorId, month: period.reference, amount
    });
    return success(res, {
      id: insert.insertId, receiptCode: code, lessons, rateCents: rate, amountCents: amount,
      prototypeNotice: "Pagamento ficticio para demonstracao academica."
    }, "Pagamento ao instrutor realizado");
  })
);

// Instrutor: meus meses (aulas dadas, valor e se ja caiu na conta).
router.get(
  "/me",
  auth(["instructor"]),
  asyncHandler(async (req, res) => {
    const memberships = await db.query(
      `SELECT iu.institution_id, iu.lesson_rate_cents, i.name AS institution_name
       FROM institution_user iu
       INNER JOIN institutions i ON i.id = iu.institution_id
       WHERE iu.user_id = ? AND iu.membership_role = 'instructor' AND iu.status = 'active'`,
      [req.user.sub]
    );

    const months = [];
    const now = new Date();
    for (let i = 0; i < 12; i += 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${date.getFullYear()}-${pad(date.getMonth() + 1)}`);
    }

    const result = [];
    for (const membership of memberships) {
      const payouts = await db.query(
        `SELECT reference_month, lessons_count, rate_cents, amount_cents, method, receipt_code, paid_at
         FROM instructor_payouts WHERE institution_id = ? AND instructor_id = ?`,
        [membership.institution_id, req.user.sub]
      );
      for (const month of months) {
        const period = parseMonth(month);
        const payout = payouts.find((row) => row.reference_month === month) || null;
        const lessons = payout ? payout.lessons_count : await countLessons(membership.institution_id, req.user.sub, period.start, period.end);
        const rate = payout ? payout.rate_cents : membership.lesson_rate_cents;
        if (!lessons && !payout) continue;
        result.push({
          month,
          institutionName: membership.institution_name,
          lessons,
          rateCents: rate === null ? null : Number(rate),
          amountCents: rate === null ? null : lessons * Number(rate),
          status: payout ? "paid" : "pending",
          receiptCode: payout ? payout.receipt_code : null,
          paidAt: payout ? payout.paid_at : null,
          method: payout ? payout.method : null
        });
      }
    }
    result.sort((a, b) => b.month.localeCompare(a.month));

    return success(res, {
      currentMonth: currentMonth(),
      items: result,
      receivedCents: result.filter((row) => row.status === "paid").reduce((sum, row) => sum + row.amountCents, 0),
      pendingCents: result.filter((row) => row.status === "pending" && row.amountCents).reduce((sum, row) => sum + row.amountCents, 0)
    }, "Salario carregado com sucesso");
  })
);

module.exports = router;
