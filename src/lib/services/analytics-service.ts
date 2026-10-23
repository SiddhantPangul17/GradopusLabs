import "server-only";
import type { PipelineStage } from "mongoose";
import { bucketKeys, inPeriod, TIME_ZONE, type AnalyticsQuery, type Bucket, type Period } from "@/lib/analytics/period";
import type { PaymentStatus } from "@/lib/constants";
import { connectToDatabase } from "@/lib/db/mongodb";
import { assertAdmin, type Actor } from "@/lib/services/authorization";
import { CertificateModel } from "@/models/certificate";
import { EnrollmentModel } from "@/models/enrollment";
import { LearningModuleModel } from "@/models/learning-module";
import { LearningProgressModel } from "@/models/learning-progress";
import { PaymentModel } from "@/models/payment";
import { ProgramModel } from "@/models/program";
import { SubmissionModel } from "@/models/submission";
import { UserModel } from "@/models/user";

/*
 * Admin analytics: ONE place for every metric definition (docs/analytics.md).
 * Read-only MongoDB aggregations, filtered first on indexed fields, returning
 * aggregates only (no names, emails, submission content, tokens or provider data).
 *
 * Key definitions:
 * - Collected (gross): payments that were CONFIRMED by the provider (status
 *   paid, or a refund state that can only follow paid), counted once per
 *   payment record (one record per provider order; duplicate webhooks never
 *   create records), by `paidAt` (payment time), per currency, per mode
 *   (live and test are never mixed). Created/authorized/pending/failed orders
 *   are never revenue. Enrolment status is never used to infer payment.
 * - Refunds: NOT tracked (refunds are not processed through the platform yet),
 *   so refund totals and net collected are reported as unavailable.
 * - "Requirements met": an enrolment whose progress snapshot state is
 *   "requirements_completed", the cached result of THE progress rule used by
 *   the student pages and certificate eligibility (refreshed on every
 *   submission, review, reading mark and content change).
 * - Completion rate = requirements met ÷ current enrolments (status active or
 *   completed); pending and cancelled enrolments are excluded.
 */

type Money = { currency: string; amount: number; count: number };
export type SeriesPoint = { key: string; label: string; value: number };

/** Statuses that mean money was collected (refund states can only follow "paid"). */
export const COLLECTED_PAYMENT_STATUSES = ["paid", "refund_pending", "partially_refunded", "refunded"] as const satisfies readonly PaymentStatus[];
const FINAL_REVIEW = ["accepted", "changes_requested", "rejected"];
/** "Current" enrolments for progress metrics: active or completed (pending and cancelled have no learning access). */
const CURRENT = ["active", "completed"];

async function ready(actor: Actor) {
  assertAdmin(actor);
  await connectToDatabase();
}

// ---------- Helpers ----------

/** Local-time bucket start (YYYY-MM-DD) of a date field, computed by MongoDB. */
function bucketExpr(field: string, bucket: Bucket) {
  return {
    $dateToString: {
      date: { $dateTrunc: { date: `$${field}`, unit: bucket, timezone: TIME_ZONE, startOfWeek: "monday" } },
      format: "%Y-%m-%d",
      timezone: TIME_ZONE,
    },
  };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function bucketLabel(key: string, bucket: Bucket): string {
  const [y, m, d] = key.split("-").map(Number);
  if (bucket === "month") return `${MONTHS[m - 1]} ${y}`;
  return `${bucket === "week" ? "Week of " : ""}${d} ${MONTHS[m - 1]}`;
}

/** Every bucket of the period, with zero where no records exist (a real zero, not missing data). */
function fill(period: Period, rows: { _id: string; value: number }[]): SeriesPoint[] {
  const byKey = new Map(rows.map((row) => [row._id, row.value]));
  const first = rows.map((row) => row._id).sort()[0] ?? null;
  return bucketKeys(period, first).map((key) => ({ key, label: bucketLabel(key, period.bucket), value: byKey.get(key) ?? 0 }));
}

async function countSeries(model: { aggregate: (pipeline: PipelineStage[]) => Promise<unknown> }, match: Record<string, unknown>, field: string, period: Period) {
  const rows = (await model.aggregate([
    { $match: match },
    { $group: { _id: bucketExpr(field, period.bucket), value: { $sum: 1 } } },
  ])) as { _id: string; value: number }[];
  return fill(period, rows);
}

function collectedMatch(query: AnalyticsQuery) {
  return { mode: query.mode, status: { $in: [...COLLECTED_PAYMENT_STATUSES] }, paidAt: inPeriod(query.period) };
}

async function collectedByCurrency(query: AnalyticsQuery): Promise<Money[]> {
  const rows = await PaymentModel.aggregate<{ _id: string; amount: number; count: number }>([
    { $match: collectedMatch(query) },
    { $group: { _id: "$currency", amount: { $sum: "$amount" }, count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  return rows.map((row) => ({ currency: row._id, amount: row.amount, count: row.count }));
}

/** Current (active/completed) enrolments whose cached progress says requirements are met. */
function requirementsMetPipeline(match: Record<string, unknown>): PipelineStage[] {
  return [
    { $match: { ...match, status: { $in: CURRENT } } },
    {
      $lookup: {
        from: LearningProgressModel.collection.collectionName,
        localField: "_id",
        foreignField: "enrollmentId",
        as: "progress",
        pipeline: [{ $project: { _id: 0, state: "$snapshot.state" } }],
      },
    },
    { $match: { "progress.state": "requirements_completed" } },
  ];
}

/** Requirements met but no valid certificate yet (eligibility is re-checked at issuance). */
async function certificateBacklog(): Promise<number> {
  const rows = await EnrollmentModel.aggregate<{ n: number }>([
    ...requirementsMetPipeline({}),
    {
      $lookup: {
        from: CertificateModel.collection.collectionName,
        localField: "_id",
        foreignField: "enrollmentId",
        as: "certificates",
        pipeline: [{ $project: { _id: 0, status: 1 } }],
      },
    },
    { $match: { "certificates.status": { $nin: ["issued", "revoked"] } } },
    { $count: "n" },
  ]);
  return rows[0]?.n ?? 0;
}

async function statusCounts<T extends string>(
  model: { aggregate: (pipeline: PipelineStage[]) => Promise<unknown> },
  match: Record<string, unknown>,
): Promise<Partial<Record<T, number>>> {
  const rows = (await model.aggregate([{ $match: match }, { $group: { _id: "$status", n: { $sum: 1 } } }])) as { _id: T; n: number }[];
  return Object.fromEntries(rows.map((row) => [row._id, row.n])) as Partial<Record<T, number>>;
}

// ---------- Overview ----------

export type OverviewReport = {
  lifetime: {
    students: number;
    publishedPrograms: number;
    activeEnrollments: number;
    completedEnrollments: number;
    requirementsMet: number;
    pendingSubmissions: number;
    validCertificates: number;
    revokedCertificates: number;
  };
  period: {
    newStudents: number;
    newEnrollments: number;
    collected: Money[];
    submissionsReceived: number;
    acceptedSubmissions: number;
    certificatesIssued: number;
    certificatesRevoked: number;
  };
  series: { registrations: SeriesPoint[]; revenue: { currency: string; points: SeriesPoint[] }[] };
  empty: boolean;
};

export async function getOverviewReport(actor: Actor, query: AnalyticsQuery): Promise<OverviewReport> {
  await ready(actor);
  const { period } = query;
  const range = inPeriod(period);
  const [
    students,
    newStudents,
    publishedPrograms,
    enrollmentStatus,
    newEnrollments,
    requirementsMet,
    pendingSubmissions,
    submissionsReceived,
    acceptedSubmissions,
    certificateStatus,
    certificatesIssued,
    certificatesRevoked,
    collected,
    registrations,
    revenue,
  ] = await Promise.all([
    UserModel.countDocuments({ role: "student" }),
    UserModel.countDocuments({ role: "student", createdAt: range }),
    ProgramModel.countDocuments({ status: "published" }),
    statusCounts<string>(EnrollmentModel, {}),
    EnrollmentModel.countDocuments({ createdAt: range }),
    EnrollmentModel.aggregate<{ n: number }>([...requirementsMetPipeline({}), { $count: "n" }]),
    SubmissionModel.countDocuments({ status: { $in: ["submitted", "under_review"] } }),
    SubmissionModel.countDocuments({ submittedAt: range }),
    SubmissionModel.countDocuments({ status: "accepted", reviewedAt: range }),
    statusCounts<string>(CertificateModel, {}),
    CertificateModel.countDocuments({ issuedAt: range }),
    CertificateModel.countDocuments({ revokedAt: range }),
    collectedByCurrency(query),
    countSeries(UserModel, { role: "student", createdAt: range }, "createdAt", period),
    revenueSeries(query),
  ]);

  const lifetime = {
    students,
    publishedPrograms,
    activeEnrollments: enrollmentStatus.active ?? 0,
    completedEnrollments: enrollmentStatus.completed ?? 0,
    requirementsMet: requirementsMet[0]?.n ?? 0,
    pendingSubmissions,
    validCertificates: certificateStatus.issued ?? 0,
    revokedCertificates: certificateStatus.revoked ?? 0,
  };
  return {
    lifetime,
    period: { newStudents, newEnrollments, collected, submissionsReceived, acceptedSubmissions, certificatesIssued, certificatesRevoked },
    series: { registrations, revenue },
    empty: students === 0 && publishedPrograms === 0 && Object.values(enrollmentStatus).every((n) => !n),
  };
}

// ---------- Revenue ----------

async function revenueSeries(query: AnalyticsQuery): Promise<{ currency: string; points: SeriesPoint[] }[]> {
  const rows = await PaymentModel.aggregate<{ _id: { key: string; currency: string }; value: number }>([
    { $match: collectedMatch(query) },
    { $group: { _id: { key: bucketExpr("paidAt", query.period.bucket), currency: "$currency" }, value: { $sum: "$amount" } } },
  ]);
  const currencies = [...new Set(rows.map((row) => row._id.currency))].sort();
  return currencies.map((currency) => ({
    currency,
    points: fill(
      query.period,
      rows.filter((row) => row._id.currency === currency).map((row) => ({ _id: row._id.key, value: row.value })),
    ),
  }));
}

export type RevenueReport = {
  mode: "live" | "test";
  collected: (Money & { average: number })[];
  series: { currency: string; points: SeriesPoint[] }[];
  byProgram: { programId: string; title: string; status: string; currency: string; amount: number; count: number }[];
  /** Payments STARTED in the period, by current status (not revenue). */
  started: Partial<Record<PaymentStatus, number>>;
  needsAttention: number;
  refunds: { available: false; reason: string };
};

export async function getRevenueReport(actor: Actor, query: AnalyticsQuery): Promise<RevenueReport> {
  await ready(actor);
  const [collected, series, programRows, started, needsAttention] = await Promise.all([
    collectedByCurrency(query),
    revenueSeries(query),
    PaymentModel.aggregate<{ _id: { programId: unknown; currency: string }; amount: number; count: number }>([
      { $match: collectedMatch(query) },
      { $group: { _id: { programId: "$programId", currency: "$currency" }, amount: { $sum: "$amount" }, count: { $sum: 1 } } },
      { $sort: { amount: -1 } },
      { $limit: 500 },
    ]),
    statusCounts<PaymentStatus>(PaymentModel, { mode: query.mode, createdAt: inPeriod(query.period) }),
    PaymentModel.countDocuments({ mode: query.mode, attentionReason: { $type: "string" } }),
  ]);
  const programs = await ProgramModel.find({ _id: { $in: programRows.map((row) => row._id.programId) } }).select("title status").lean();
  const programBy = new Map(programs.map((program) => [program._id.toString(), program]));
  return {
    mode: query.mode,
    collected: collected.map((item) => ({ ...item, average: item.count ? Math.round(item.amount / item.count) : 0 })),
    series,
    byProgram: programRows.map((row) => {
      const program = programBy.get(String(row._id.programId));
      return {
        programId: String(row._id.programId),
        title: program?.title ?? "Unknown program",
        status: program?.status ?? "unknown",
        currency: row._id.currency,
        amount: row.amount,
        count: row.count,
      };
    }),
    started,
    needsAttention,
    refunds: { available: false, reason: "Refunds are not processed through the platform yet, so no confirmed refund records exist." },
  };
}

// ---------- Programs ----------

export type ProgramRow = {
  programId: string;
  title: string;
  status: string;
  /** Enrolments CREATED in the period, by current status. */
  enrollments: { total: number; active: number; completed: number; cancelled: number; pending: number; paid: number; manual: number };
  requirementsMet: number;
  /** requirementsMet ÷ (active + completed); null when there are none. */
  completionRate: number | null;
  collected: Money[];
  certificatesIssued: number;
  /** Current, not period-based. */
  pendingSubmissions: number;
};

export async function getProgramReport(actor: Actor, query: AnalyticsQuery): Promise<{ rows: ProgramRow[] }> {
  await ready(actor);
  const range = inPeriod(query.period);
  const [programs, enrollmentRows, metRows, revenueRows, pendingRows, certificateRows] = await Promise.all([
    ProgramModel.find().select("title status").sort({ title: 1 }).limit(500).lean(),
    EnrollmentModel.aggregate<{ _id: { programId: unknown; status: string; source: string }; n: number }>([
      { $match: { createdAt: range } },
      { $group: { _id: { programId: "$programId", status: "$status", source: "$source" }, n: { $sum: 1 } } },
    ]),
    EnrollmentModel.aggregate<{ _id: unknown; n: number }>([...requirementsMetPipeline({ createdAt: range }), { $group: { _id: "$programId", n: { $sum: 1 } } }]),
    PaymentModel.aggregate<{ _id: { programId: unknown; currency: string }; amount: number; count: number }>([
      { $match: collectedMatch(query) },
      { $group: { _id: { programId: "$programId", currency: "$currency" }, amount: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]),
    SubmissionModel.aggregate<{ _id: unknown; n: number }>([
      { $match: { status: { $in: ["submitted", "under_review"] } } },
      { $group: { _id: "$programId", n: { $sum: 1 } } },
    ]),
    CertificateModel.aggregate<{ _id: unknown; n: number }>([{ $match: { issuedAt: range } }, { $group: { _id: "$programId", n: { $sum: 1 } } }]),
  ]);

  const id = (value: unknown) => String(value);
  const rows = programs.map((program): ProgramRow => {
    const key = program._id.toString();
    const enrollments = { total: 0, active: 0, completed: 0, cancelled: 0, pending: 0, paid: 0, manual: 0 };
    for (const row of enrollmentRows.filter((item) => id(item._id.programId) === key)) {
      enrollments.total += row.n;
      if (row._id.status in enrollments) enrollments[row._id.status as "active" | "completed" | "cancelled" | "pending"] += row.n;
      if (row._id.source === "payment") enrollments.paid += row.n;
      else enrollments.manual += row.n;
    }
    const requirementsMet = metRows.find((row) => id(row._id) === key)?.n ?? 0;
    const denominator = enrollments.active + enrollments.completed;
    return {
      programId: key,
      title: program.title,
      status: program.status,
      enrollments,
      requirementsMet,
      completionRate: denominator > 0 ? requirementsMet / denominator : null,
      collected: revenueRows
        .filter((row) => id(row._id.programId) === key)
        .map((row) => ({ currency: row._id.currency, amount: row.amount, count: row.count })),
      certificatesIssued: certificateRows.find((row) => id(row._id) === key)?.n ?? 0,
      pendingSubmissions: pendingRows.find((row) => id(row._id) === key)?.n ?? 0,
    };
  });
  return { rows };
}

// ---------- Learning, students and submissions ----------

export type LearningReport = {
  registrations: SeriesPoint[];
  enrollmentsStarted: SeriesPoint[];
  submissions: {
    /** Attempts submitted in the period (each resubmission counts once). */
    attempts: number;
    /** Distinct enrolment + task pairs among them. */
    uniqueTasks: number;
    resubmissions: number;
    /** Current status of the attempts submitted in the period. */
    byStatus: Record<string, number>;
    series: SeriesPoint[];
  };
  reviews: {
    /** Final decisions recorded in the period. */
    decisions: Partial<Record<string, number>>;
    /** Hours from submission to the recorded decision, for decisions in the period. */
    averageHours: number | null;
    medianHours: number | null;
  };
  pendingNow: { submissions: number; students: number; oldestSubmittedAt: string | null };
  /** Current (active/completed) enrolments by cached progress state. */
  progressStates: Record<string, number>;
  certificateBacklog: number;
  modules: { programId: string; programTitle: string; moduleId: string; moduleTitle: string; completed: number; enrolled: number }[];
};

export async function getLearningReport(actor: Actor, query: AnalyticsQuery): Promise<LearningReport> {
  await ready(actor);
  const { period } = query;
  const range = inPeriod(period);
  const [registrations, enrollmentsStarted, submissionStats, submissionSeries, decisions, timing, pending, progressStates, backlog, moduleRows, enrolledRows] =
    await Promise.all([
      countSeries(UserModel, { role: "student", createdAt: range }, "createdAt", period),
      countSeries(EnrollmentModel, { createdAt: range }, "createdAt", period),
      SubmissionModel.aggregate<{ attempts: { n: number }[]; unique: { n: number }[]; resubmissions: { n: number }[]; byStatus: { _id: string; n: number }[] }>([
        { $match: { submittedAt: range } },
        {
          $facet: {
            attempts: [{ $count: "n" }],
            unique: [{ $group: { _id: { e: "$enrollmentId", t: "$taskId" } } }, { $count: "n" }],
            resubmissions: [{ $match: { attempt: { $gt: 1 } } }, { $count: "n" }],
            byStatus: [{ $group: { _id: "$status", n: { $sum: 1 } } }],
          },
        },
      ]),
      countSeries(SubmissionModel, { submittedAt: range }, "submittedAt", period),
      statusCounts<string>(SubmissionModel, { status: { $in: FINAL_REVIEW }, reviewedAt: range }),
      reviewTiming(range),
      SubmissionModel.aggregate<{ n: number; students: unknown[]; oldest: Date | null }>([
        { $match: { status: { $in: ["submitted", "under_review"] } } },
        { $group: { _id: null, n: { $sum: 1 }, students: { $addToSet: "$studentId" }, oldest: { $min: "$submittedAt" } } },
      ]),
      EnrollmentModel.aggregate<{ _id: string | null; n: number }>([
        { $match: { status: { $in: CURRENT } } },
        {
          $lookup: {
            from: LearningProgressModel.collection.collectionName,
            localField: "_id",
            foreignField: "enrollmentId",
            as: "progress",
            pipeline: [{ $project: { _id: 0, state: "$snapshot.state" } }],
          },
        },
        { $group: { _id: { $ifNull: [{ $first: "$progress.state" }, "not_calculated"] }, n: { $sum: 1 } } },
      ]),
      certificateBacklog(),
      // Module completion among current enrolments (same cached rule).
      EnrollmentModel.aggregate<{ _id: unknown; n: number }>([
        { $match: { status: { $in: CURRENT } } },
        {
          $lookup: {
            from: LearningProgressModel.collection.collectionName,
            localField: "_id",
            foreignField: "enrollmentId",
            as: "progress",
            pipeline: [{ $project: { _id: 0, done: "$snapshot.completedModuleIds" } }],
          },
        },
        { $unwind: "$progress" },
        { $unwind: "$progress.done" },
        { $group: { _id: "$progress.done", n: { $sum: 1 } } },
      ]),
      EnrollmentModel.aggregate<{ _id: unknown; n: number }>([{ $match: { status: { $in: CURRENT } } }, { $group: { _id: "$programId", n: { $sum: 1 } } }]),
    ]);

  const facet = submissionStats[0];
  const modules = await LearningModuleModel.find({ isPublished: true }).select("title programId order").sort({ programId: 1, order: 1 }).limit(300).lean();
  const programs = await ProgramModel.find({ _id: { $in: [...new Set(modules.map((module) => module.programId.toString()))] } }).select("title").lean();
  const titleOf = new Map(programs.map((program) => [program._id.toString(), program.title]));

  return {
    registrations,
    enrollmentsStarted,
    submissions: {
      attempts: facet?.attempts[0]?.n ?? 0,
      uniqueTasks: facet?.unique[0]?.n ?? 0,
      resubmissions: facet?.resubmissions[0]?.n ?? 0,
      byStatus: Object.fromEntries((facet?.byStatus ?? []).map((row) => [row._id, row.n])),
      series: submissionSeries,
    },
    reviews: { decisions, ...timing },
    pendingNow: {
      submissions: pending[0]?.n ?? 0,
      students: pending[0]?.students.length ?? 0,
      oldestSubmittedAt: pending[0]?.oldest?.toISOString() ?? null,
    },
    progressStates: Object.fromEntries(progressStates.map((row) => [row._id ?? "not_calculated", row.n])),
    certificateBacklog: backlog,
    modules: modules.map((module) => ({
      programId: module.programId.toString(),
      programTitle: titleOf.get(module.programId.toString()) ?? "Unknown program",
      moduleId: module._id.toString(),
      moduleTitle: module.title,
      completed: moduleRows.find((row) => String(row._id) === module._id.toString())?.n ?? 0,
      enrolled: enrolledRows.find((row) => String(row._id) === module.programId.toString())?.n ?? 0,
    })),
  };
}

async function reviewTiming(range: ReturnType<typeof inPeriod>): Promise<{ averageHours: number | null; medianHours: number | null }> {
  const match = { $match: { status: { $in: FINAL_REVIEW }, reviewedAt: range } };
  const duration = { $divide: [{ $subtract: ["$reviewedAt", "$submittedAt"] }, 3_600_000] };
  const [average] = await SubmissionModel.aggregate<{ avg: number | null }>([match, { $group: { _id: null, avg: { $avg: duration } } }]);
  let median: number | null = null;
  try {
    // $percentile needs MongoDB 7.0+ (Atlas default); otherwise the median is reported as unavailable.
    const [row] = await SubmissionModel.aggregate<{ p: number[] }>([
      match,
      { $group: { _id: null, p: { $percentile: { input: duration, p: [0.5], method: "approximate" } } } },
    ]);
    median = row?.p?.[0] ?? null;
  } catch {
    median = null;
  }
  const round = (value: number | null | undefined) => (typeof value === "number" ? Math.round(value * 10) / 10 : null);
  return { averageHours: round(average?.avg), medianHours: round(median) };
}

// ---------- Certificates ----------

export type CertificateReport = {
  period: { issued: number; revoked: number; superseded: number };
  lifetime: { issuedEver: number; valid: number; revoked: number; superseded: number };
  series: SeriesPoint[];
  byProgram: { programId: string; title: string; issuedInPeriod: number; validNow: number }[];
  backlog: number;
};

export async function getCertificateReport(actor: Actor, query: AnalyticsQuery): Promise<CertificateReport> {
  await ready(actor);
  const { period } = query;
  const range = inPeriod(period);
  const [issued, revoked, superseded, status, series, byProgramRows, backlog] = await Promise.all([
    CertificateModel.countDocuments({ issuedAt: range }),
    CertificateModel.countDocuments({ revokedAt: range }),
    CertificateModel.countDocuments({ supersededAt: range }),
    statusCounts<string>(CertificateModel, {}),
    countSeries(CertificateModel, { issuedAt: range }, "issuedAt", period),
    CertificateModel.aggregate<{ _id: unknown; issuedInPeriod: number; validNow: number; snapshotTitle: string }>([
      {
        $group: {
          _id: "$programId",
          issuedInPeriod: { $sum: { $cond: [{ $and: [period.from ? { $gte: ["$issuedAt", period.from] } : true, { $lt: ["$issuedAt", period.to] }] }, 1, 0] } },
          validNow: { $sum: { $cond: [{ $eq: ["$status", "issued"] }, 1, 0] } },
          snapshotTitle: { $last: "$programTitleSnapshot" },
        },
      },
      { $sort: { issuedInPeriod: -1 } },
      { $limit: 500 },
    ]),
    certificateBacklog(),
  ]);
  const programs = await ProgramModel.find({ _id: { $in: byProgramRows.map((row) => row._id) } }).select("title").lean();
  const titleOf = new Map(programs.map((program) => [program._id.toString(), program.title]));
  const lifetime = { valid: status.issued ?? 0, revoked: status.revoked ?? 0, superseded: status.superseded ?? 0 };
  return {
    period: { issued, revoked, superseded },
    // Every certificate record was issued once; revocation and supersession never delete it.
    lifetime: { issuedEver: lifetime.valid + lifetime.revoked + lifetime.superseded, ...lifetime },
    series,
    byProgram: byProgramRows.map((row) => ({
      programId: String(row._id),
      title: titleOf.get(String(row._id)) ?? row.snapshotTitle,
      issuedInPeriod: row.issuedInPeriod,
      validNow: row.validNow,
    })),
    backlog,
  };
}
