import "next-auth";

declare module "next-auth" {
  interface User {
    /** Copied into the session cookie at sign-in; compared with the database on every request. */
    sessionVersion?: number;
  }

  interface Session {
    sessionVersion?: number;
  }
}
