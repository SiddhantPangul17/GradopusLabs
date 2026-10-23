import { LogoutButton } from "@/components/auth/logout-button";
import { ButtonLink } from "@/components/ui/button";
import { homePathForRole } from "@/lib/auth/redirects";
import { getCurrentUser } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

/**
 * Header account area: "Log in" / "Register" for visitors, or a dashboard
 * link and "Log out" for signed-in users. Reads the session, so it must be
 * rendered inside <Suspense> (the rest of the header stays static).
 */
export async function AccountControls({ variant }: { variant: "desktop" | "mobile" }) {
  const user = await getCurrentUser();
  const mobile = variant === "mobile";
  const size = mobile ? "md" : "sm";

  return (
    <div className={cn(mobile ? "grid gap-2" : "flex items-center gap-2")}>
      {user ? (
        <>
          <ButtonLink href={homePathForRole(user.role)} variant="outline" size={size} fullWidth={mobile}>
            {user.role === "admin" ? "Admin dashboard" : "My dashboard"}
          </ButtonLink>
          <LogoutButton fullWidth={mobile} variant={mobile ? "outline" : "ghost"} />
        </>
      ) : (
        <>
          <ButtonLink href="/login" variant="outline" size={size} fullWidth={mobile}>
            Log in
          </ButtonLink>
          <ButtonLink href="/register" size={size} fullWidth={mobile}>
            Register
          </ButtonLink>
        </>
      )}
    </div>
  );
}

/** Same footprint as the controls, so the header does not shift while they load. */
export function AccountControlsFallback({ variant }: { variant: "desktop" | "mobile" }) {
  return <div aria-hidden="true" className={variant === "mobile" ? "h-[6.25rem]" : "h-9 w-44"} />;
}
