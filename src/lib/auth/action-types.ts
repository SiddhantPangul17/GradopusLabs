/* Result types for the auth Server Actions, shared with the client forms. */

export type LoginState =
  | { status: "idle" }
  | { status: "error"; message?: string; errors?: Partial<Record<"email" | "password", string>>; email: string };

export type RegisterState =
  | { status: "idle" }
  | {
      status: "error";
      message?: string;
      errors?: Partial<Record<"name" | "email" | "password" | "confirmPassword" | "acceptTerms", string>>;
      // Passwords are never sent back to the browser.
      values: { name: string; email: string; acceptTerms: boolean };
    };

export type ForgotPasswordState =
  | { status: "idle" }
  | { status: "error"; errors: Partial<Record<"email", string>>; email: string }
  | { status: "submitted"; deliveryAvailable: boolean; rateLimited: boolean; devMode: boolean };

export type ResetPasswordState =
  | { status: "idle" }
  | { status: "error"; message?: string; errors?: Partial<Record<"password" | "confirmPassword", string>> };
