"use server";

import { signOut } from "@/auth";
import { refresh } from "next/cache";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/session";
import { readFormText } from "@/lib/forms";
import { markModuleRead } from "@/lib/services/learning-service";
import { markAllNotificationsRead, markNotificationRead } from "@/lib/services/notification-service";
import { changeOwnPassword, updateOwnProfile } from "@/lib/services/profile-service";
import type { ServiceFailure } from "@/lib/services/result";
import { submitTaskAttempt } from "@/lib/services/submission-service";
import type { FormResult, PasswordChangeResult } from "@/lib/student/action-types";

/*
 * Student Server Actions. Each one verifies the session and the student role
 * itself (never trusting the page that rendered the form), then calls a
 * service that checks ownership in its database queries. IDs passed in are
 * treated as untrusted input.
 */

const UNEXPECTED = "Something went wrong. Please try again in a moment.";

type Guard = { user: CurrentUser; error?: never } | { user?: never; error: FormResult };

async function requireStudentForAction(): Promise<Guard> {
  const user = await getCurrentUser();
  if (!user) return { error: { status: "error", message: "Your session has ended. Please log in again." } };
  if (user.role !== "student") return { error: { status: "error", message: "Only student accounts can do this." } };
  return { user };
}

function toFormError(failure: ServiceFailure): FormResult {
  return { status: "error", message: failure.message, ...(failure.fieldErrors ? { fieldErrors: failure.fieldErrors } : {}) };
}

export async function submitTaskAction(taskId: string, _previous: FormResult, formData: FormData): Promise<FormResult> {
  const guard = await requireStudentForAction();
  if (guard.error) return guard.error;

  const submissionType = readFormText(formData, "submissionType", 20);
  const input =
    submissionType === "text"
      ? { submissionType, textContent: readFormText(formData, "textContent", 20_000) }
      : { submissionType, projectUrl: readFormText(formData, "projectUrl", 4_000) };

  try {
    const result = await submitTaskAttempt({ id: guard.user.id, role: guard.user.role }, taskId, input);
    if (!result.ok) return toFormError(result);
    refresh();
    return { status: "success", message: `Attempt ${result.data.attempt} submitted.` };
  } catch {
    console.error("[student] submission failed unexpectedly");
    return { status: "error", message: UNEXPECTED };
  }
}

export async function markModuleReadAction(enrollmentId: string, moduleId: string): Promise<FormResult> {
  const guard = await requireStudentForAction();
  if (guard.error) return guard.error;
  try {
    const result = await markModuleRead({ id: guard.user.id, role: guard.user.role }, enrollmentId, moduleId);
    if (!result.ok) return toFormError(result);
    refresh();
    return { status: "success", message: "Module marked as complete." };
  } catch {
    console.error("[student] marking module failed unexpectedly");
    return { status: "error", message: UNEXPECTED };
  }
}

export async function updateProfileAction(_previous: FormResult, formData: FormData): Promise<FormResult> {
  const guard = await requireStudentForAction();
  if (guard.error) return guard.error;
  try {
    // Only the name is read: any other submitted field (role, email, status…) is ignored.
    const result = await updateOwnProfile({ id: guard.user.id, role: guard.user.role }, { name: readFormText(formData, "name", 300) });
    if (!result.ok) return toFormError(result);
    refresh();
    return { status: "success", message: "Your profile was updated." };
  } catch {
    console.error("[student] profile update failed unexpectedly");
    return { status: "error", message: UNEXPECTED };
  }
}

export async function changePasswordAction(_previous: PasswordChangeResult, formData: FormData): Promise<PasswordChangeResult> {
  const guard = await requireStudentForAction();
  if (guard.error) return guard.error;
  try {
    const result = await changeOwnPassword(
      { id: guard.user.id, role: guard.user.role },
      {
        currentPassword: readFormText(formData, "currentPassword", 600),
        newPassword: readFormText(formData, "newPassword", 600),
        confirmPassword: readFormText(formData, "confirmPassword", 600),
      },
    );
    if (!result.ok) return toFormError(result);
    // All sessions were ended by the service; clear this browser's cookie too.
    await signOut({ redirect: false });
    return { status: "password_changed" };
  } catch {
    console.error("[student] password change failed unexpectedly");
    return { status: "error", message: UNEXPECTED };
  }
}

// ---------- Notifications ----------

/** Marks one of the student's own notifications as read (another user's id behaves like a missing one). */
export async function markNotificationReadAction(notificationId: string): Promise<FormResult> {
  const guard = await requireStudentForAction();
  if (guard.error) return guard.error;
  try {
    const result = await markNotificationRead({ id: guard.user.id, role: guard.user.role }, notificationId);
    if (!result.ok) return toFormError(result);
    refresh();
    return { status: "success", message: "Marked as read." };
  } catch {
    return { status: "error", message: UNEXPECTED };
  }
}

export async function markAllNotificationsReadAction(): Promise<FormResult> {
  const guard = await requireStudentForAction();
  if (guard.error) return guard.error;
  try {
    const count = await markAllNotificationsRead({ id: guard.user.id, role: guard.user.role });
    refresh();
    return { status: "success", message: count === 1 ? "1 notification marked as read." : `${count} notifications marked as read.` };
  } catch {
    return { status: "error", message: UNEXPECTED };
  }
}
