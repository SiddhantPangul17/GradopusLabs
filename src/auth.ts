import "server-only";
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/auth/rate-limit";
import { getClientIp } from "@/lib/auth/request";
import { authenticateWithPassword } from "@/lib/services/auth-service";
import { loginInputSchema } from "@/lib/validation/user";

/*
 * Auth.js (next-auth v5) configuration: email + password via the Credentials
 * provider, with JWT sessions in an encrypted, HTTP-only cookie.
 *
 * The session cookie only identifies the user (`sub`) and the session
 * version it was issued with (`sv`). Roles and account status are NEVER read
 * from it: src/lib/auth/session.ts loads them from the database on every
 * request and rejects the session if the account is inactive or the
 * version has changed (logout, password reset, role change).
 *
 * Cookies (Auth.js defaults): HttpOnly, SameSite=Lax, Path=/, and Secure with
 * a __Secure- prefix when served over HTTPS. AUTH_SECRET encrypts them.
 */

/** Error codes are placed in URLs by Auth.js, so they must stay generic. */
export class RateLimitedSignIn extends CredentialsSignin {
  code = "rate_limited";
}
export class InactiveAccountSignIn extends CredentialsSignin {
  code = "account_inactive";
}

export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

// `.env.example` lists AUTH_URL= and AUTH_TRUST_HOST= empty. Auth.js treats an EMPTY
// AUTH_URL as set (which disables AUTH_TRUST_HOST and rejects every request as an
// untrusted host), so empty values are removed here, matching src/lib/env.ts.
for (const key of ["AUTH_URL", "AUTH_TRUST_HOST"] as const) {
  if (process.env[key] === "") delete process.env[key];
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: { email: { type: "email" }, password: { type: "password" } },
      // Runs for every credentials sign-in, including direct POSTs to
      // /api/auth/callback/credentials, so rate limiting lives here.
      async authorize(credentials, request) {
        const parsed = loginInputSchema.safeParse({ email: credentials?.email, password: credentials?.password });
        if (!parsed.success) return null;

        const ip = getClientIp(request.headers);
        const [perIp, perAccount] = await Promise.all([
          consumeRateLimit(RATE_LIMITS.loginPerIp, ip),
          consumeRateLimit(RATE_LIMITS.loginPerAccount, parsed.data.email),
        ]);
        if (!perIp.allowed || !perAccount.allowed) throw new RateLimitedSignIn();

        const result = await authenticateWithPassword(parsed.data.email, parsed.data.password);
        if (!result.ok) {
          if (result.reason === "account_inactive") throw new InactiveAccountSignIn();
          return null;
        }
        return { id: result.user.id, sessionVersion: result.user.sessionVersion };
      },
    }),
  ],
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SECONDS, updateAge: 24 * 60 * 60 },
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        // Keep the token minimal: no name, email or role.
        return { sub: user.id, sv: user.sessionVersion ?? 0 };
      }
      return token;
    },
    session({ session, token }) {
      return {
        expires: session.expires,
        user: { id: typeof token.sub === "string" ? token.sub : undefined },
        sessionVersion: typeof token.sv === "number" ? token.sv : undefined,
      };
    },
  },
  logger: {
    // Log the error type only: never credentials, tokens or request details.
    // (`type` is stable; `name` is minified in production builds.)
    error(error) {
      if (error instanceof CredentialsSignin) return; // expected for failed logins
      const type = (error as { type?: string }).type ?? "UnknownError";
      // An unreadable or forged session cookie is treated as signed out; not a server fault.
      if (type === "JWTSessionError") console.warn("[auth] rejected an invalid session cookie");
      else console.error(`[auth] ${type}`);
    },
    warn(code) {
      console.warn(`[auth] warning: ${code}`);
    },
    debug() {},
  },
});
