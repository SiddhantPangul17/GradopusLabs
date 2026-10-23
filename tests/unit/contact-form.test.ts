import { afterEach, describe, expect, it, vi } from "vitest";
import { freshModules } from "../helpers";

vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "203.0.113.5" }) }));

// Every secret is set explicitly, so nothing from a local .env file can reach a real database or provider.
const base = { NODE_ENV: "test", MONGODB_URI: "", AUTH_SECRET: "", SITE_URL: "", EMAIL_REPLY_TO: "" };
const emailOff = { ...base, EMAIL_PROVIDER: "", EMAIL_API_KEY: "", EMAIL_FROM: "" };
const emailOn = { ...base, EMAIL_PROVIDER: "resend", EMAIL_API_KEY: "re_test_key_123", EMAIL_FROM: "Gradopus Labs <noreply@mail.example.com>" };

const valid = { name: "Asha", email: "asha@example.com", subject: "Question", message: "I would like to know more about the program." };

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

async function load(env: Record<string, string>) {
  await freshModules(env);
  const { submitContactMessage } = await import("@/app/(public)/contact/actions");
  const { brand } = await import("@/config/brand");
  return { submit: (fields: Record<string, string>) => submitContactMessage({ status: "idle" }, form(fields)), inbox: brand.contact.email };
}

function stubFetch(status: number, body: unknown) {
  const mock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", mock);
  return mock;
}

describe("contact form", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reports honestly that nothing was sent when email delivery is off", async () => {
    const { submit } = await load(emailOff);
    const fetchMock = stubFetch(200, { id: "x" });
    await expect(submit(valid)).resolves.toMatchObject({ status: "not-connected" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("emails a valid message to the support inbox with the sender as reply-to", async () => {
    const { submit, inbox } = await load(emailOn);
    const fetchMock = stubFetch(200, { id: "email_123" });
    await expect(submit(valid)).resolves.toEqual({ status: "sent" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.to).toEqual([inbox]);
    expect(body.reply_to).toBe("asha@example.com");
    expect(body.subject).toBe("Contact form: Question");
    expect(body.text).toContain(valid.message);
  });

  it("reports an error, never success, when delivery fails", async () => {
    const { submit } = await load(emailOn);
    stubFetch(422, { name: "validation_error" });
    await expect(submit(valid)).resolves.toMatchObject({ status: "error", values: valid });
  });

  it("silently accepts honeypot submissions without sending anything", async () => {
    const { submit } = await load(emailOn);
    const fetchMock = stubFetch(200, { id: "x" });
    await expect(submit({ ...valid, website: "https://spam.example" })).resolves.toEqual({ status: "sent" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects invalid input without sending", async () => {
    const { submit } = await load(emailOn);
    const fetchMock = stubFetch(200, { id: "x" });
    const result = await submit({ ...valid, email: "not-an-email", message: "short" });
    expect(result).toMatchObject({ status: "invalid", errors: { email: expect.any(String), message: expect.any(String) } });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
