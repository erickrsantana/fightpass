const express = require("express");
const db = require("../../database/connection");
const { asyncHandler, success, auth, ApiError } = require("../../lib/http");
const { ensureInstitutionAccess } = require("../../lib/business");

const router = express.Router();

// Percentual que o FightPass retem sobre o valor de cada aula. Pode ser trocado no .env (PLATFORM_FEE_PERCENT=15).
const FEE_PERCENT = Number(process.env.PLATFORM_FEE_PERCENT || 15);
// Dia do mes seguinte em que o repasse cai na conta da academia.
const PAYOUT_DAY = 10;

function pad(value) {
  return String(value).padStart(2, "0");
}

function todayDateOnly() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function parseMonth(value) {
  const reference = value && /^\d{4}-\d{2}$/.test(value) ? value : todayDateOnly().slice(0, 7);
  const [year, month] = reference.split("-").map(Number);
  if (month < 1 || month > 12) {
    throw new ApiError(422, "Mes invalido. Use o formato AAAA-MM");
  }
  const lastDay = new Date(year, month, 0).getDate();
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return {
    reference,
    start: `${year}-${pad(month)}-01`,
    end: `${year}-${pad(month)}-${pad(lastDay)}`,
    payoutDate: `${nextYear}-${pad(nextMonth)}-${pad(PAYOUT_DAY)}`
  };
}

// Cada aula vale: (valor pago pelo aluno no plano) / (treinos do plano).
// Planos ilimitados dividem o valor entre os treinos realmente agendados.
function lessonGrossCents(row) {
  const divisor = Math.max(Number(row.pass_divisor) || 0, 1);
  return Math.round((Number(row.pass_amount_cents) || 0) / divisor);
}

function buildSummary(rows, feePercent, today) {
  const entries = rows.map((row) => {
    const gross = lessonGrossCents(row);
    const fee = Math.round(gross * feePercent / 100);
    const net = gross - fee;
    const bookingDate = String(row.booking_date).slice(0, 10);

    let status;
    if (row.attendance_status === "present") status = "realized";
    else if (row.attendance_status === "absent") status = "absent";
    else if (bookingDate >= today) status = "forecast";
    else status = "no_checkin";

    return {
      bookingId: row.booking_id,
      date: bookingDate,
      studentName: row.student_name,
      modalityName: row.modality_name,
      classTitle: row.class_title,
      planName: row.plan_name,
      grossCents: gross,
      feeCents: fee,
      netCents: net,
      status
    };
  });

  const sum = (status, key) => entries
    .filter((entry) => entry.status === status)
    .reduce((total, entry) => total + entry[key], 0);

  return {
    entries,
    totals: {
      realizedGrossCents: sum("realized", "grossCents"),
      realizedFeeCents: sum("realized", "feeCents"),
      realizedNetCents: sum("realized", "netCents"),
      forecastNetCents: sum("forecast", "netCents"),
      realizedLessons: entries.filter((entry) => entry.status === "realized").length,
      forecastLessons: entries.filter((entry) => entry.status === "forecast").length
    }
  };
}

router.get(
  "/institution/:id",
  auth(["institution_admin"]),
  asyncHandler(async (req, res) => {
    await ensureInstitutionAccess(req.user.sub, req.params.id, ["institution_admin"]);
    const period = parseMonth(req.query.month);

    const rows = await db.query(
      `SELECT b.id AS booking_id,
              b.booking_date,
              u.name AS student_name,
              m.name AS modality_name,
              c.title AS class_title,
              ap.name AS plan_name,
              a.status AS attendance_status,
              COALESCE(ps.amount_cents - ps.penalty_cents, CASE WHEN sap.source = 'payment' THEN ap.price_cents ELSE 0 END) AS pass_amount_cents,
              COALESCE(sap.sessions_total, (
                SELECT COUNT(*) FROM access_pass_usage apu2 WHERE apu2.access_pass_id = sap.id
              )) AS pass_divisor
       FROM bookings b
       INNER JOIN class_schedules cs ON cs.id = b.class_schedule_id
       INNER JOIN classes c ON c.id = cs.class_id
       INNER JOIN modalities m ON m.id = c.modality_id
       INNER JOIN users u ON u.id = b.student_id
       INNER JOIN access_pass_usage apu ON apu.booking_id = b.id
       INNER JOIN student_access_passes sap ON sap.id = apu.access_pass_id
       INNER JOIN access_plans ap ON ap.id = sap.plan_id
       LEFT JOIN payment_simulations ps ON ps.access_pass_id = sap.id AND ps.status = 'paid'
       LEFT JOIN attendances a ON a.booking_id = b.id
       WHERE c.institution_id = ?
         AND b.status <> 'cancelled'
         AND b.booking_date BETWEEN ? AND ?
       ORDER BY b.booking_date DESC, b.id DESC`,
      [req.params.id, period.start, period.end]
    );

    const summary = buildSummary(rows, FEE_PERCENT, todayDateOnly());

    return success(
      res,
      {
        month: period.reference,
        feePercent: FEE_PERCENT,
        payoutDate: period.payoutDate,
        ...summary
      },
      "Financeiro carregado com sucesso"
    );
  })
);

module.exports = router;
module.exports.buildSummary = buildSummary;