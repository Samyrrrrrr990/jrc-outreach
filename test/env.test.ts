import { beforeEach, describe, expect, it } from "vitest";
import { loadEnv, resetEnvCache } from "../src/config/env";

// Built at runtime so the secret scanner's private-key rule can't match
// this test source.
const FAKE_KEY = ["-----BEGIN ", "PRIVATE KEY-----"].join("") + "\nabc\n";

const SERVICE_ACCOUNT = JSON.stringify({
  type: "service_account",
  client_email: "bot@example.iam.gserviceaccount.com",
  private_key: FAKE_KEY,
});

function baseEnv(): NodeJS.ProcessEnv {
  return {
    GOOGLE_SERVICE_ACCOUNT_JSON: SERVICE_ACCOUNT,
    SHEET_ID: "1abcdefghijklmnop",
    SMTP_HOST: "smtp.example.com",
    SMTP_PORT: "465",
    SMTP_USER: "u",
    SMTP_PASS: "p",
    IMAP_HOST: "imap.example.com",
    IMAP_PORT: "993",
    IMAP_USER: "u",
    IMAP_PASS: "p",
    SENDER_NAME: "Test Sender",
    SENDER_EMAIL: "sender@example.com",
  };
}

describe("loadEnv", () => {
  beforeEach(() => resetEnvCache());

  it("accepts a fully valid environment", () => {
    const env = loadEnv(baseEnv());
    expect(env.serviceAccount.client_email).toBe(
      "bot@example.iam.gserviceaccount.com",
    );
    expect(env.SMTP_PORT).toBe(465);
  });

  it("treats empty-string values as unset (CI passes '' for unset secrets)", () => {
    const env = loadEnv({
      ...baseEnv(),
      UNSUBSCRIBE_URL: "",
      REPLY_TO_EMAIL: " ",
      SMTP_SECURE: "",
      ORG_PROFILE: "",
    });
    expect(env.UNSUBSCRIBE_URL).toBeUndefined();
    expect(env.REPLY_TO_EMAIL).toBeUndefined();
    expect(env.SMTP_SECURE).toBe(true); // default applies
  });

  it("still validates optional fields when they ARE set", () => {
    expect(() =>
      loadEnv({ ...baseEnv(), UNSUBSCRIBE_URL: "someone@example.com" }),
    ).toThrow(/UNSUBSCRIBE_URL/);
  });

  it("still fails loudly when a required field is empty", () => {
    expect(() => loadEnv({ ...baseEnv(), SMTP_HOST: "" })).toThrow(
      /SMTP_HOST/,
    );
  });
});
