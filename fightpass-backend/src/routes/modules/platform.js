const express = require("express");
const db = require("../../database/connection");
const { ApiError, asyncHandler, success, auth } = require("../../lib/http");
const { auditLog, getUserInstitutions } = require("../../lib/business");

const router = express.Router();
const onlyPlatform = auth(["platform_admin"]);

// Percentual que o FightPass retem sobre cada aula (igual ao Financeiro das academias).
const FEE_PERCENT = Number(process.env.PLATFORM_FEE_PERCENT || 15);

function pad(value) {
  return String(value).padStart(2, "0");
}

function monthKeyOf(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

function todayDateOnly() {
  const now = new Date();
  return `${monthKeyOf(now)}-${pad(now.getDate())}`;
}

// Lista de meses (AAAA-MM), do mais antigo ao mes atual.
function buildMonths(count) {
  const now = new Date();
  const list = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    list.push(monthKeyOf(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  }
  return list;
}

function zeroSeries(months) {
  return Object.fromEntries(months.map((month) => [month, 0]));
}

// Cada aula vale: (valor pago pelo aluno no plano) / (treinos do plano).
function lessonGrossCents(row) {
  const divisor = Math.max(Number(row.pass_divisor) || 0, 1);
  return Math.round((Number(row.pass_amount_cents) || 0) / divisor);
}

// Home: total de usuarios cadastrados (por tipo) e de academias.
router.get(
  "/overview",
  onlyPlatform,
  asyncHandler(async (req, res) => {
    const byRole = await db.query(
      `SELECT r.code AS role, r.name AS role_name, COUNT(u.id) AS total
       FROM roles r
       LEFT JOIN users u ON u.role_id = r.id AND u.is_active = 1
       GROUP BY r.id, r.code, r.name
       ORDER BY r.id`
    );
    const institutions = await db.query(
      `SELECT COUNT(*) AS total, COALESCE(SUM(status = 'active'), 0) AS active FROM institutions`
    );
    const recent = await db.query(
      `SELECT COUNT(*) AS total FROM users WHERE created_at >= (NOW() - INTERVAL 30 DAY)`
    );

    const roles = byRole.map((row) => ({
      role: row.role,
      name: row.role_name,
      total: Number(row.total)
    }));

    return success(
      res,
      {
        totalUsers: roles.reduce((sum, row) => sum + row.total, 0),
        newUsersLast30Days: Number(recent[0].total),
        roles,
        institutions: {
          total: Number(institutions[0].total),
          active: Number(institutions[0].active)
        }
      },
      "Visao geral carregada com sucesso"
    );
  })
);

// Mapa: academias com coordenadas e quantidade de pessoas em cada uma.
router.get(
  "/institutions",
  onlyPlatform,
  asyncHandler(async (req, res) => {
    const rows = await db.query(
      `SELECT i.id, i.name, i.logo_url, i.status,
              a.neighborhood, a.city, a.state, a.latitude, a.longitude,
              (SELECT COUNT(DISTINCT e.student_id) FROM enrollments e WHERE e.institution_id = i.id) AS students_count,
              (SELECT COUNT(*) FROM institution_user iu WHERE iu.institution_id = i.id AND iu.status = 'active' AND iu.membership_role = 'instructor') AS instructors_count
       FROM institutions i
       LEFT JOIN addresses a ON a.institution_id = i.id
       WHERE i.status = 'active'
       ORDER BY i.name`
    );
    return success(
      res,
      rows.map((row) => ({
        ...row,
        students_count: Number(row.students_count),
        instructors_count: Number(row.instructors_count)
      })),
      "Academias carregadas com sucesso"
    );
  })
);

// Planos: somente leitura.
router.get(
  "/plans",
  onlyPlatform,
  asyncHandler(async (req, res) => {
    const studentPlans = await db.query("SELECT * FROM access_plans ORDER BY id");
    const institutionPlans = await db.query("SELECT * FROM platform_plans ORDER BY id");
    return success(res, { studentPlans, institutionPlans }, "Planos carregados com sucesso");
  })
);

// Financeiro do FightPass: receita (taxa sobre aulas + mensalidades de academias), crescimento e pagamentos.
router.get(
  "/finance",
  onlyPlatform,
  asyncHandler(async (req, res) => {
    const requested = Number(req.query.months);
    const count = [3, 6, 12].includes(requested) ? requested : 6;
    const months = buildMonths(count);
    const now = new Date();
    const start = `${months[0]}-01`;
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const end = `${monthKeyOf(now)}-${pad(lastDay)}`;
    const today = todayDateOnly();
    const currentMonth = months[months.length - 1];

    // 1) Aulas: taxa do FightPass (realizada quando houve presenca; prevista quando ainda vai acontecer).
    const lessons = await db.query(
      `SELECT b.booking_date,
              c.institution_id,
              i.name AS institution_name,
              a.status AS attendance_status,
              COALESCE(ps.amount_cents - ps.penalty_cents, CASE WHEN sap.source = 'payment' THEN ap.price_cents ELSE 0 END) AS pass_amount_cents,
              COALESCE(sap.sessions_total, (
                SELECT COUNT(*) FROM access_pass_usage apu2 WHERE apu2.access_pass_id = sap.id
              )) AS pass_divisor
       FROM bookings b
       INNER JOIN class_schedules cs ON cs.id = b.class_schedule_id
       INNER JOIN classes c ON c.id = cs.class_id
       INNER JOIN institutions i ON i.id = c.institution_id
       INNER JOIN access_pass_usage apu ON apu.booking_id = b.id
       INNER JOIN student_access_passes sap ON sap.id = apu.access_pass_id
       INNER JOIN access_plans ap ON ap.id = sap.plan_id
       LEFT JOIN payment_simulations ps ON ps.access_pass_id = sap.id AND ps.status = 'paid'
       LEFT JOIN attendances a ON a.booking_id = b.id
       WHERE b.status <> 'cancelled'
         AND b.booking_date BETWEEN ? AND ?`,
      [start, end]
    );

    const feeRealized = zeroSeries(months);
    const feeForecast = zeroSeries(months);
    const byInstitution = new Map();

    lessons.forEach((row) => {
      const bookingDate = String(row.booking_date instanceof Date
        ? `${row.booking_date.getFullYear()}-${pad(row.booking_date.getMonth() + 1)}-${pad(row.booking_date.getDate())}`
        : row.booking_date).slice(0, 10);
      const month = bookingDate.slice(0, 7);
      if (!(month in feeRealized)) return;
      const fee = Math.round(lessonGrossCents(row) * FEE_PERCENT / 100);

      if (row.attendance_status === "present") {
        feeRealized[month] += fee;
        const entry = byInstitution.get(row.institution_id) || { id: row.institution_id, name: row.institution_name, feeCents: 0, lessons: 0 };
        entry.feeCents += fee;
        entry.lessons += 1;
        byInstitution.set(row.institution_id, entry);
      } else if (row.attendance_status !== "absent" && bookingDate >= today) {
        feeForecast[month] += fee;
      }
    });

    // 2) Pagamentos dos alunos (volume) e mensalidades das academias (plano DOJO).
    const studentPaid = await db.query(
      `SELECT DATE_FORMAT(COALESCE(paid_at, created_at), '%Y-%m') AS ym, SUM(amount_cents - penalty_cents) AS total, COUNT(*) AS n
       FROM payment_simulations
       WHERE status = 'paid' AND COALESCE(paid_at, created_at) >= ?
       GROUP BY ym`,
      [start]
    );
    const penaltyPaid = await db.query(
      `SELECT DATE_FORMAT(COALESCE(paid_at, created_at), '%Y-%m') AS ym, SUM(penalty_cents) AS total
       FROM payment_simulations
       WHERE status = 'paid' AND penalty_cents > 0 AND COALESCE(paid_at, created_at) >= ?
       GROUP BY ym`,
      [start]
    );
    const dojoPaid = await db.query(
      `SELECT DATE_FORMAT(COALESCE(paid_at, created_at), '%Y-%m') AS ym, SUM(amount_cents) AS total, COUNT(*) AS n
       FROM dojo_payment_simulations
       WHERE status = 'paid' AND COALESCE(paid_at, created_at) >= ?
       GROUP BY ym`,
      [start]
    );

    const studentGross = zeroSeries(months);
    const dojoRevenue = zeroSeries(months);
    const penaltyRevenue = zeroSeries(months);
    let studentPaymentsCount = 0;
    let studentPaymentsTotal = 0;
    studentPaid.forEach((row) => {
      if (row.ym in studentGross) {
        studentGross[row.ym] += Number(row.total);
        studentPaymentsCount += Number(row.n);
        studentPaymentsTotal += Number(row.total);
      }
    });
    penaltyPaid.forEach((row) => {
      if (row.ym in penaltyRevenue) penaltyRevenue[row.ym] += Number(row.total);
    });
    dojoPaid.forEach((row) => {
      if (row.ym in dojoRevenue) dojoRevenue[row.ym] += Number(row.total);
    });

    // 3) Quem entrou: novas contas por mes (alunos e academias).
    const signups = await db.query(
      `SELECT DATE_FORMAT(u.created_at, '%Y-%m') AS ym, r.code AS role, COUNT(*) AS n
       FROM users u
       INNER JOIN roles r ON r.id = u.role_id
       WHERE u.created_at >= ? AND r.code IN ('student', 'institution_admin')
       GROUP BY ym, r.code`,
      [start]
    );
    const newStudents = zeroSeries(months);
    const newInstitutions = zeroSeries(months);
    signups.forEach((row) => {
      if (!(row.ym in newStudents)) return;
      if (row.role === "student") newStudents[row.ym] += Number(row.n);
      else newInstitutions[row.ym] += Number(row.n);
    });

    // 4) Mensalidades ativas (receita recorrente) e distribuicao dos planos de alunos.
    const subscriptions = await db.query(
      `SELECT COUNT(*) AS n, COALESCE(SUM(monthly_fee_cents), 0) AS total
       FROM institution_platform_subscriptions WHERE status = 'active'`
    );
    const plans = await db.query(
      `SELECT ap.name, COUNT(*) AS total
       FROM student_access_passes sap
       INNER JOIN access_plans ap ON ap.id = sap.plan_id
       GROUP BY ap.id, ap.name
       ORDER BY total DESC`
    );

    // 5) Ultimos pagamentos recebidos (alunos e academias).
    const recent = await db.query(
      `(SELECT DATE_FORMAT(COALESCE(ps.paid_at, ps.created_at), '%Y-%m-%d') AS paid_on,
               'Aluno' AS kind, u.name AS payer, CONCAT(COALESCE(ap.name, 'Plano'), IF(ps.penalty_cents > 0, ' (com multa de troca)', '')) AS item,
               ps.method AS method, ps.amount_cents AS amount_cents
        FROM payment_simulations ps
        INNER JOIN users u ON u.id = ps.student_id
        LEFT JOIN student_access_passes sap ON sap.id = ps.access_pass_id
        LEFT JOIN access_plans ap ON ap.id = sap.plan_id
        WHERE ps.status = 'paid')
       UNION ALL
       (SELECT DATE_FORMAT(COALESCE(d.paid_at, d.created_at), '%Y-%m-%d'),
               'Academia', i.name, 'Plano DOJO', d.method, d.amount_cents
        FROM dojo_payment_simulations d
        INNER JOIN institutions i ON i.id = d.institution_id
        WHERE d.status = 'paid')
       ORDER BY paid_on DESC
       LIMIT 15`
    );

    const sum = (series) => months.reduce((total, month) => total + series[month], 0);
    const revenueByMonth = months.map((month) => feeRealized[month] + dojoRevenue[month] + penaltyRevenue[month]);

    return success(
      res,
      {
        feePercent: FEE_PERCENT,
        months,
        series: {
          feeRealized: months.map((month) => feeRealized[month]),
          feeForecast: months.map((month) => feeForecast[month]),
          dojo: months.map((month) => dojoRevenue[month]),
          penalties: months.map((month) => penaltyRevenue[month]),
          revenue: revenueByMonth,
          studentGross: months.map((month) => studentGross[month]),
          newStudents: months.map((month) => newStudents[month]),
          newInstitutions: months.map((month) => newInstitutions[month])
        },
        totals: {
          monthRevenueCents: revenueByMonth[revenueByMonth.length - 1],
          monthForecastCents: feeForecast[currentMonth],
          periodRevenueCents: revenueByMonth.reduce((total, value) => total + value, 0),
          periodStudentGrossCents: sum(studentGross),
          averageTicketCents: studentPaymentsCount ? Math.round(studentPaymentsTotal / studentPaymentsCount) : 0,
          activeSubscriptions: Number(subscriptions[0].n),
          recurringDojoCents: Number(subscriptions[0].total),
          newStudentsMonth: newStudents[currentMonth],
          newInstitutionsMonth: newInstitutions[currentMonth]
        },
        byInstitution: Array.from(byInstitution.values()).sort((a, b) => b.feeCents - a.feeCents).slice(0, 8),
        plans: plans.map((row) => ({ name: row.name, total: Number(row.total) })),
        recentPayments: recent.map((row) => ({
          date: row.paid_on,
          kind: row.kind,
          payer: row.payer,
          item: row.item,
          method: row.method,
          amountCents: Number(row.amount_cents)
        }))
      },
      "Financeiro carregado com sucesso"
    );
  })
);

// ---------------------------------------------------------------------------
// Usuarios: lista com busca/filtro e ficha completa
// ---------------------------------------------------------------------------
const ROLE_FILTERS = ["student", "instructor", "institution_admin", "platform_admin"];

router.get(
  "/users",
  onlyPlatform,
  asyncHandler(async (req, res) => {
    const role = ROLE_FILTERS.includes(req.query.role) ? req.query.role : null;
    const q = String(req.query.q || "").trim().slice(0, 80);

    const where = [];
    const params = [];
    if (role) {
      where.push("r.code = ?");
      params.push(role);
    }
    if (q) {
      const onlyDigits = /^#?\d+$/.test(q);
      if (onlyDigits) {
        const number = Number(q.replace("#", ""));
        where.push("(u.id = ? OR u.document LIKE ? OR u.phone LIKE ?)");
        params.push(number, `%${q.replace("#", "")}%`, `%${q.replace("#", "")}%`);
      } else {
        where.push("(u.name LIKE ? OR u.email LIKE ? OR u.document LIKE ?)");
        params.push(`%${q}%`, `%${q}%`, `%${q}%`);
      }
    }

    const users = await db.query(
      `SELECT u.id, u.name, u.email, u.document, u.phone, u.is_active, u.created_at,
              (u.avatar_url IS NOT NULL AND u.avatar_url <> '') AS has_avatar,
              r.code AS role, r.name AS role_name
       FROM users u
       INNER JOIN roles r ON r.id = u.role_id
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY u.id DESC
       LIMIT 500`,
      params
    );

    const counts = await db.query(
      `SELECT r.code AS role, COUNT(u.id) AS total
       FROM roles r LEFT JOIN users u ON u.role_id = r.id
       GROUP BY r.code`
    );

    return success(
      res,
      {
        users: users.map((row) => ({ ...row, has_avatar: Boolean(row.has_avatar) })),
        counts: Object.fromEntries(counts.map((row) => [row.role, Number(row.total)]))
      },
      "Usuarios carregados com sucesso"
    );
  })
);

router.get(
  "/users/:id",
  onlyPlatform,
  asyncHandler(async (req, res) => {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new ApiError(400, "ID invalido");
    }

    const rows = await db.query(
      `SELECT u.id, u.name, u.email, u.document, u.phone, u.gender, u.avatar_url,
              u.is_active, u.created_at, r.code AS role, r.name AS role_name
       FROM users u INNER JOIN roles r ON r.id = u.role_id
       WHERE u.id = ? LIMIT 1`,
      [userId]
    );
    const user = rows[0];
    if (!user) {
      throw new ApiError(404, "Usuario nao encontrado");
    }

    const ficha = { user, institutions: await getUserInstitutions(userId) };

    if (user.role === "institution_admin") {
      ficha.ownedInstitutions = await db.query(
        `SELECT i.id, i.name, i.status,
                (SELECT COUNT(DISTINCT e.student_id) FROM enrollments e WHERE e.institution_id = i.id) AS students_count
         FROM institutions i WHERE i.owner_user_id = ? ORDER BY i.name`,
        [userId]
      );
    }

    if (user.role === "student") {
      ficha.enrollments = await db.query(
        `SELECT e.id, e.status, e.started_at, i.name AS institution_name, m.name AS modality_name
         FROM enrollments e
         INNER JOIN institutions i ON i.id = e.institution_id
         INNER JOIN modalities m ON m.id = e.modality_id
         WHERE e.student_id = ? ORDER BY e.id DESC LIMIT 20`,
        [userId]
      );
      ficha.passes = await db.query(
        `SELECT sap.id, ap.name AS plan_name, sap.source, sap.status, sap.starts_at, sap.expires_at,
                sap.sessions_total, sap.sessions_used
         FROM student_access_passes sap
         INNER JOIN access_plans ap ON ap.id = sap.plan_id
         WHERE sap.student_id = ? ORDER BY sap.id DESC LIMIT 20`,
        [userId]
      );
      ficha.payments = await db.query(
        `SELECT ps.id, ap.name AS plan_name, ps.method, ps.amount_cents,
                COALESCE(ps.penalty_cents, 0) AS penalty_cents, ps.status, ps.paid_at, ps.created_at
         FROM payment_simulations ps
         INNER JOIN access_plans ap ON ap.id = ps.plan_id
         WHERE ps.student_id = ? ORDER BY ps.id DESC LIMIT 20`,
        [userId]
      );
      ficha.bookings = await db.query(
        `SELECT b.id, b.booking_date, b.status, c.title, i.name AS institution_name,
                m.name AS modality_name, a.status AS attendance_status
         FROM bookings b
         INNER JOIN class_schedules cs ON cs.id = b.class_schedule_id
         INNER JOIN classes c ON c.id = cs.class_id
         INNER JOIN institutions i ON i.id = c.institution_id
         INNER JOIN modalities m ON m.id = c.modality_id
         LEFT JOIN attendances a ON a.booking_id = b.id
         WHERE b.student_id = ?
         ORDER BY b.booking_date DESC, b.id DESC LIMIT 15`,
        [userId]
      );
      const totals = await db.query(
        `SELECT COUNT(*) AS bookings_total,
                COALESCE(SUM(a.status = 'present'), 0) AS present_total
         FROM bookings b LEFT JOIN attendances a ON a.booking_id = b.id
         WHERE b.student_id = ? AND b.status <> 'cancelled'`,
        [userId]
      );
      ficha.summary = {
        bookings: Number(totals[0].bookings_total),
        present: Number(totals[0].present_total)
      };
      ficha.evaluations = await db.query(
        `SELECT se.score, se.comment, se.created_at, m.name AS modality_name, i.name AS institution_name
         FROM student_evaluations se
         INNER JOIN modalities m ON m.id = se.modality_id
         INNER JOIN institutions i ON i.id = se.institution_id
         WHERE se.student_user_id = ? ORDER BY se.id DESC LIMIT 10`,
        [userId]
      );
    }

    return success(res, ficha, "Ficha carregada com sucesso");
  })
);

// ---------------------------------------------------------------------------
// Atualizar plano: o novo valor/requisito vale para todos
// ---------------------------------------------------------------------------
function readPlanBody(body, { withSessions }) {
  const name = String(body.name || "").trim();
  const description = String(body.description || "").trim();
  const price = Number(body.priceCents);
  const duration = Number(body.durationDays);
  if (name.length < 2 || name.length > 100) throw new ApiError(422, "Nome do plano invalido");
  if (description.length < 3 || description.length > 255) throw new ApiError(422, "Descricao invalida (3 a 255 caracteres)");
  if (!Number.isInteger(price) || price < 0 || price > 10000000) throw new ApiError(422, "Valor invalido");
  if (!Number.isInteger(duration) || duration < 1 || duration > 730) throw new ApiError(422, "Validade invalida (1 a 730 dias)");

  const plan = { name, description, price, duration, isActive: body.isActive ? 1 : 0, applyToActive: Boolean(body.applyToActive) };
  if (withSessions) {
    if (body.sessionLimit === null || body.sessionLimit === "" || body.sessionLimit === undefined) {
      plan.sessionLimit = null;
    } else {
      const limit = Number(body.sessionLimit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new ApiError(422, "Limite de treinos invalido");
      plan.sessionLimit = limit;
    }
  }
  return plan;
}

router.put(
  "/plans/student/:id",
  onlyPlatform,
  asyncHandler(async (req, res) => {
    const planId = Number(req.params.id);
    const plan = readPlanBody(req.body || {}, { withSessions: true });
    const current = await db.query("SELECT id FROM access_plans WHERE id = ? LIMIT 1", [planId]);
    if (!current[0]) throw new ApiError(404, "Plano nao encontrado");

    await db.query(
      `UPDATE access_plans
       SET name = ?, description = ?, price_cents = ?, session_limit = ?, duration_days = ?, is_active = ?
       WHERE id = ?`,
      [plan.name, plan.description, plan.price, plan.sessionLimit, plan.duration, plan.isActive, planId]
    );

    let updatedPasses = 0;
    if (plan.applyToActive) {
      const result = await db.query(
        `UPDATE student_access_passes
         SET sessions_total = CASE WHEN ? IS NULL THEN NULL ELSE GREATEST(?, sessions_used) END
         WHERE plan_id = ? AND status = 'active'`,
        [plan.sessionLimit, plan.sessionLimit, planId]
      );
      updatedPasses = Number(result && result.affectedRows) || 0;
    }

    await auditLog(req.user.sub, "platform.student_plan_update", "access_plans", planId, {
      priceCents: plan.price,
      sessionLimit: plan.sessionLimit,
      durationDays: plan.duration,
      applyToActive: plan.applyToActive
    });
    return success(res, { id: planId, updatedPasses }, "Plano atualizado para todos");
  })
);

router.put(
  "/plans/institution/:id",
  onlyPlatform,
  asyncHandler(async (req, res) => {
    const planId = Number(req.params.id);
    const plan = readPlanBody(req.body || {}, { withSessions: false });
    const current = await db.query("SELECT id FROM platform_plans WHERE id = ? LIMIT 1", [planId]);
    if (!current[0]) throw new ApiError(404, "Plano nao encontrado");

    await db.query(
      `UPDATE platform_plans
       SET name = ?, description = ?, price_cents = ?, duration_days = ?, is_active = ?
       WHERE id = ?`,
      [plan.name, plan.description, plan.price, plan.duration, plan.isActive, planId]
    );

    let updatedSubscriptions = 0;
    if (plan.applyToActive) {
      const result = await db.query(
        "UPDATE institution_platform_subscriptions SET monthly_fee_cents = ? WHERE plan_id = ?",
        [plan.price, planId]
      );
      updatedSubscriptions = Number(result && result.affectedRows) || 0;
    }

    await auditLog(req.user.sub, "platform.institution_plan_update", "platform_plans", planId, {
      priceCents: plan.price,
      durationDays: plan.duration,
      applyToActive: plan.applyToActive
    });
    return success(res, { id: planId, updatedSubscriptions }, "Plano atualizado para todos");
  })
);

module.exports = router;
