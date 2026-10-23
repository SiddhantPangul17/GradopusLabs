import { afterEach, describe, expect, it, vi } from "vitest";
import { freshModules } from "../helpers";
import { EmailPermanentError, EmailTransientError } from "@/lib/email/provider";
import { ResendProvider } from "@/lib/email/resend";
import {
  certificateIssuedEmail,
  contactMessageEmail,
  escapeHtml,
  passwordResetEmail,
  paymentConfirmationEmail,
  safeSubject,
  submissionReviewedEmail,
  welcomeEmail,
} from "@/lib/email/templates";
import { safeInternalLink } from "@/lib/services/notification-service";

const evil = `<script>alert("x")</script><img src=x onerror=alert(1)>`;

describe("email templates", () => {
  it("escape every user-provided value (names, titles, feedback)", () => {
    const email = submissionReviewedEmail({
      name: evil,
      programTitle: evil,
      taskTitle: `Task ${evil}`,
      outcome: "Accepted",
      feedback: `Nice <b>work</b> ${evil}`,
      link: "https://krushitech.example/student/tasks/abc#attempt-1",
    });
    expect(email.html).not.toContain("<script>");
    expect(email.html).not.toContain("<img");
    expect(email.html).not.toContain("<b>work</b>");
    expect(email.html).toContain("&lt;script&gt;");
    // Plain text keeps the literal text (no HTML is ever interpreted there).
    expect(email.text).toContain("Nice <b>work</b>");
  });

  it("produce single-line subjects (no header injection)", () => {
    expect(safeSubject("Hello\r\nBcc: victim@example.com")).toBe("Hello Bcc: victim@example.com");
    const email = certificateIssuedEmail({
      name: "Sam",
      programTitle: "Web\r\nBcc: x@y.z",
      certificateId: "KT-2026-000001",
      issuedAt: "1 October 2026",
      link: "https://k.example/student/certificates/KT-2026-000001",
      verifyUrl: "https://k.example/verify?id=KT-2026-000001",
    });
    expect(email.subject).not.toMatch(/[\r\n]/);
  });

  it("always include a plain-text alternative and the link", () => {
    for (const email of [
      welcomeEmail({ name: "Sam", loginUrl: "https://k.example/login", programsUrl: "https://k.example/programs" }),
      passwordResetEmail({ resetUrl: "https://k.example/reset-password?token=abc", expiresInMinutes: 30 }),
    ]) {
      expect(email.text.length).toBeGreaterThan(50);
      expect(email.html).toContain("<!doctype html>");
    }
  });

  it("do not claim more than is true", () => {
    const welcome = welcomeEmail({ name: "Sam", loginUrl: "https://k.example/login", programsUrl: "https://k.example/programs" });
    expect(welcome.text.toLowerCase()).not.toContain("verified");
    const payment = paymentConfirmationEmail({
      name: "Sam",
      programTitle: "Web",
      amount: "₹149",
      reference: "pay_123",
      paidAt: "1 October 2026",
      link: "https://k.example/student/payments",
      linkLabel: "View your payments",
    });
    expect(payment.text).toContain("not a tax invoice");
    const reset = passwordResetEmail({ resetUrl: "https://k.example/reset-password?token=abc", expiresInMinutes: 30 });
    expect(reset.text).toContain("expires in 30 minutes");
  });

  it("escapeHtml covers quotes for attributes", () => {
    expect(escapeHtml(`"'&<>`)).toBe("&quot;&#39;&amp;&lt;&gt;");
  });
});

describe("notification links", () => {
  it("allow only internal student paths", () => {
    expect(safeInternalLink("/student/certificates/KT-2026-000001")).toBe("/student/certificates/KT-2026-000001");
    expect(safeInternalLink("/student/tasks/6653a1b2c3d4e5f6a7b8c9d0#attempt-2")).toBe("/student/tasks/6653a1b2c3d4e5f6a7b8c9d0#attempt-2");
    for (const bad of [
      "//evil.example",
      "https://evil.example/student",
      "/admin",
      "/student/../admin",
      "/student/./x",
      "/student\\..\\admin",
      "/student/x?next=//evil.example",
      "javascript:alert(1)",
      "/studentx",
    ]) {
      expect(safeInternalLink(bad)).toBeNull();
    }
  });
});

describe("Resend provider", () => {
  afterEach(() => vi.unstubAllGlobals());
  const message = { to: "sam@example.com", subject: "Hi", html: "<p>Hi</p>", text: "Hi", idempotencyKey: "krushitech-email-1" };
  const respond = (status: number, body: unknown) => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));

  it("sends with bearer auth and the idempotency key, and returns the provider id only on acceptance", async () => {
    respond(200, { id: "email_123" });
    const provider = new ResendProvider({ apiKey: "re_secret_key", from: "KrushiTech <noreply@mail.example>", replyTo: null });
    await expect(provider.send(message)).resolves.toEqual({ id: "email_123" });
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("authorization")).toBe("Bearer re_secret_key");
    expect(headers.get("idempotency-key")).toBe("krushitech-email-1");
    expect(String((init as RequestInit).body)).not.toContain("re_secret_key");
  });

  it("classifies failures: temporary ones retry, permanent ones stop", async () => {
    const provider = new ResendProvider({ apiKey: "re_secret_key", from: "noreply@mail.example", replyTo: null });
    for (const [status, name] of [[429, "rate_limit_exceeded"], [500, "application_error"], [409, "concurrent_idempotent_requests"], [503, "x"]] as const) {
      respond(status, { statusCode: status, name, message: "secret details" });
      await expect(provider.send(message)).rejects.toBeInstanceOf(EmailTransientError);
    }
    for (const [status, name] of [[422, "invalid_parameter"], [401, "missing_api_key"], [403, "validation_error"], [409, "invalid_idempotent_request"]] as const) {
      respond(status, { statusCode: status, name });
      await expect(provider.send(message)).rejects.toBeInstanceOf(EmailPermanentError);
    }
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
    await expect(provider.send(message)).rejects.toMatchObject({ code: "network_error" });
    // An "accepted" reply without an id is not treated as sent.
    respond(200, {});
    await expect(provider.send(message)).rejects.toBeInstanceOf(EmailTransientError);
  });

  it("never exposes provider messages in error codes", async () => {
    respond(422, { name: "invalid_parameter", message: "The to field contains sam@example.com" });
    const error = (await new ResendProvider({ apiKey: "k_12345678", from: "a@b.co", replyTo: null }).send(message).catch((e: unknown) => e)) as Error;
    expect(error.message).not.toContain("sam@example.com");
  });

  it("uses a per-message reply-to over the configured one", async () => {
    const provider = new ResendProvider({ apiKey: "re_secret_key", from: "a@b.co", replyTo: "team@b.co" });
    const body = () => JSON.parse(String(((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit).body));
    respond(200, { id: "email_1" });
    await provider.send({ ...message, replyTo: "visitor@example.com" });
    expect(body().reply_to).toBe("visitor@example.com");
    respond(200, { id: "email_2" });
    await provider.send(message);
    expect(body().reply_to).toBe("team@b.co");
  });
});

describe("contact form email", () => {
  it("escapes the sender's input and keeps the subject on one line", () => {
    const email = contactMessageEmail({
      name: evil,
      email: "visitor@example.com",
      subject: "Hello\r\nBcc: attacker@example.com",
      message: `Question ${evil}\nsecond line`,
    });
    expect(email.subject).toBe("Contact form: Hello Bcc: attacker@example.com");
    expect(email.subject).not.toMatch(/[\r\n]/);
    expect(email.html).not.toContain("<script>");
    expect(email.html).not.toContain("<img");
    expect(email.html).toContain("visitor@example.com");
    expect(email.text).toContain("second line");
  });
});

describe("email configuration", () => {
  async function config(env: Record<string, string | undefined>) {
    await freshModules(env);
    return (await import("@/lib/email/config")).getEmailConfig();
  }
  const base = { EMAIL_PROVIDER: "resend", EMAIL_API_KEY: "re_test_key_123", EMAIL_FROM: "KrushiTech <noreply@mail.example.com>" };

  it("is off without a provider and incomplete without key or sender", async () => {
    expect((await config({ EMAIL_PROVIDER: undefined })).status).toBe("disabled");
    expect((await config({ ...base, EMAIL_API_KEY: undefined })).status).toBe("misconfigured");
    expect((await config({ ...base, NODE_ENV: "development" })).status).toBe("ready");
  });

  it("requires an https SITE_URL in production", async () => {
    expect((await config({ ...base, NODE_ENV: "production", SITE_URL: undefined })).status).toBe("misconfigured");
    expect((await config({ ...base, NODE_ENV: "production", SITE_URL: "http://k.example" })).status).toBe("misconfigured");
    expect((await config({ ...base, NODE_ENV: "production", SITE_URL: "https://k.example" })).status).toBe("ready");
  });

  it("rejects a sender with line breaks (header injection)", async () => {
    await freshModules({ ...base, EMAIL_FROM: "KrushiTech <a@b.co>\r\nBcc: x@y.z" });
    const { getServerEnv } = await import("@/lib/env");
    expect(() => getServerEnv()).toThrow(/EMAIL_FROM/);
  });
});

describe("scheduled processor endpoint", () => {
  const secret = "s".repeat(40);
  async function call(env: Record<string, string | undefined>, authorization?: string) {
    await freshModules(env);
    const { POST } = await import("@/app/api/notifications/process/route");
    return POST(new Request("http://localhost/api/notifications/process", { method: "POST", headers: authorization ? { authorization } : {} }));
  }

  it("is closed until CRON_SECRET is set, and requires the exact bearer secret", async () => {
    expect((await call({ CRON_SECRET: undefined }, `Bearer ${secret}`)).status).toBe(503);
    expect((await call({ CRON_SECRET: secret })).status).toBe(401);
    expect((await call({ CRON_SECRET: secret }, `Bearer ${secret}x`)).status).toBe(401);
    expect((await call({ CRON_SECRET: secret }, secret)).status).toBe(401);
    const ok = await call({ CRON_SECRET: secret, EMAIL_PROVIDER: undefined }, `Bearer ${secret}`);
    expect(ok.status).toBe(200);
    // Without a provider nothing is sent or reported as sent.
    expect(await ok.json()).toEqual({ configured: false, sent: 0, retrying: 0, failed: 0, cancelled: 0 });
  });
});
