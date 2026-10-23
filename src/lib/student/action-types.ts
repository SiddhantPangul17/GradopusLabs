/* Result types for the student Server Actions, shared with the client forms. */
import type { FormResult } from "@/lib/form-result";

export type { FormResult };

export type PasswordChangeResult = FormResult | { status: "password_changed" };
