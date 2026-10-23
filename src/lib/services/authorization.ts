import "server-only";
import type { UserRole } from "@/lib/constants";
import { NotAuthorizedError } from "@/lib/errors";
import { isValidObjectIdString } from "@/lib/validation/common";

/**
 * The user performing an operation. It must come from a verified server-side
 * session (getCurrentUser / requireStudent / requireAdmin), never from request
 * input such as a form field, header or query string.
 */
export type Actor = { id: string; role: UserRole };

export function assertAdmin(actor: Actor | null | undefined): asserts actor is Actor {
  if (!actor || actor.role !== "admin" || !isValidObjectIdString(actor.id)) {
    throw new NotAuthorizedError();
  }
}

/** Student-only operations (learning, submissions). Data-layer check in addition to page checks. */
export function assertStudent(actor: Actor | null | undefined): asserts actor is Actor {
  if (!actor || actor.role !== "student" || !isValidObjectIdString(actor.id)) {
    throw new NotAuthorizedError();
  }
}
