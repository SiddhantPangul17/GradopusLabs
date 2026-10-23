"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { logoutAction } from "@/lib/auth/actions";

function LogoutSubmit({ fullWidth, variant }: { fullWidth?: boolean; variant: ButtonVariant }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size={fullWidth ? "md" : "sm"} fullWidth={fullWidth} loading={pending} loadingText="Logging out…">
      Log out
    </Button>
  );
}

/**
 * Logs out with a POST Server Action (ends the session on the server and
 * clears the cookie), then does a FULL page load. A client-side navigation
 * is not enough: Next.js keeps recently visited pages hidden in the DOM for
 * back navigation, and signed-in content must not survive logout.
 */
export function LogoutButton({ fullWidth, variant = "ghost" }: { fullWidth?: boolean; variant?: ButtonVariant }) {
  async function logout() {
    await logoutAction();
    window.location.replace("/");
  }

  return (
    <form action={logout} className={fullWidth ? "w-full" : undefined}>
      <LogoutSubmit fullWidth={fullWidth} variant={variant} />
    </form>
  );
}
