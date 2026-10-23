/* Result of a form Server Action, shared by student and admin forms. */

export type FormResult =
  | { status: "idle" }
  | { status: "success"; message: string }
  | { status: "error"; message: string; fieldErrors?: Record<string, string> };

export const IDLE: FormResult = { status: "idle" };
