import "server-only";
import { PROGRAM_STATUSES, USER_ROLES, type ProgramStatus, type UserRole } from "@/lib/constants";
import { connectToDatabase } from "@/lib/db/mongodb";
import { listAuditLogs, type AuditListItem } from "@/lib/services/admin-audit-service";
import { assertAdmin, type Actor } from "@/lib/services/authorization";
import { EnrollmentModel } from "@/models/enrollment";
import { ProgramModel } from "@/models/program";
import { SubmissionModel } from "@/models/submission";
import { UserModel } from "@/models/user";

export type AdminOverview = {
  users: Record<UserRole, number>;
  programs: Record<ProgramStatus, number>;
  activeEnrollments: number;
  /** Submitted or under review. */
  pendingSubmissions: number;
  recentPrograms: { id: string; title: string; status: ProgramStatus; updatedAt: string }[];
  recentActivity: AuditListItem[];
};

/** Real counts for the admin dashboard (no personal data). Admin only, checked here as well as by the caller. */
export async function getAdminOverview(actor: Actor): Promise<AdminOverview> {
  assertAdmin(actor);
  await connectToDatabase();

  const [userCounts, programCounts, activeEnrollments, pendingSubmissions, recentPrograms, activity] = await Promise.all([
    UserModel.aggregate<{ _id: UserRole; count: number }>([{ $group: { _id: "$role", count: { $sum: 1 } } }]),
    ProgramModel.aggregate<{ _id: ProgramStatus; count: number }>([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    EnrollmentModel.countDocuments({ status: "active" }),
    SubmissionModel.countDocuments({ status: { $in: ["submitted", "under_review"] } }),
    ProgramModel.find().sort({ updatedAt: -1 }).limit(5).select("title status updatedAt").lean(),
    listAuditLogs(actor, { limit: 6 }),
  ]);

  const users = Object.fromEntries(USER_ROLES.map((role) => [role, 0])) as Record<UserRole, number>;
  for (const { _id, count } of userCounts) if (_id in users) users[_id] = count;
  const programs = Object.fromEntries(PROGRAM_STATUSES.map((status) => [status, 0])) as Record<ProgramStatus, number>;
  for (const { _id, count } of programCounts) if (_id in programs) programs[_id] = count;

  return {
    users,
    programs,
    activeEnrollments,
    pendingSubmissions,
    recentPrograms: recentPrograms.map((program) => ({
      id: program._id.toString(),
      title: program.title,
      status: program.status,
      updatedAt: program.updatedAt.toISOString(),
    })),
    recentActivity: activity.items,
  };
}
