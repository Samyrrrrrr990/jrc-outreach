/**
 * Environment loading and validation. Fails LOUDLY: a missing or malformed
 * secret throws a clear error at startup rather than silently degrading, which
 * is what makes a failed GitHub Actions run visible (SKILLS.md §6).
 *
 * Nothing here is logged — the raw values are secrets.
 */
import { readFileSync } from "node:fs";
import { z } from "zod";

const boolish = z
  .string()
  .transform((v) => v.trim().toLowerCase())
  .pipe(z.enum(["true", "false", "1", "0", "yes", "no"]))
  .transform((v) => v === "true" || v === "1" || v === "yes");

const EnvSchema = z.object({
  // Google Sheets
  GOOGLE_SERVICE_ACCOUNT_JSON: z.string().optional(),
  GOOGLE_SERVICE_ACCOUNT_FILE: z.string().optional(),
  SHEET_ID: z.string().min(10, "SHEET_ID looks empty or wrong"),

  // SMTP
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive(),
  SMTP_SECURE: boolish.default("true"),
  SMTP_USER: z.string().min(1),
  SMTP_PASS: z.string().min(1),

  // IMAP
  IMAP_HOST: z.string().min(1),
  IMAP_PORT: z.coerce.number().int().positive(),
  IMAP_SECURE: boolish.default("true"),
  IMAP_USER: z.string().min(1),
  IMAP_PASS: z.string().min(1),
  IMAP_SENT_MAILBOX: z.string().default("Sent"),
  IMAP_INBOX_MAILBOX: z.string().default("INBOX"),

  // Sender identity
  SENDER_NAME: z.string().min(1),
  SENDER_EMAIL: z.string().email(),
  REPLY_TO_EMAIL: z.string().email().optional(),
  UNSUBSCRIBE_URL: z.string().url().optional(),

  // Behaviour
  /** Which org profile to run as (src/config/profiles/). */
  ORG_PROFILE: z.string().optional(),
  DRY_RUN: boolish.default("false"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  LOG_TO_SHEET: boolish.default("true"),
  /** "json" (default in CI) or "pretty" (default locally). */
  LOG_FORMAT: z.enum(["json", "pretty"]).optional(),

  // Alerting (mail/alerts.ts reads these from process.env directly so alerts
  // still work when THIS schema is what failed; listed here for validation).
  ALERT_EMAIL: z.string().email().optional(),
  ALERT_ON_FAILURE: boolish.optional(),
  ALERT_ERROR_THRESHOLD: z.coerce.number().int().positive().default(1),

  /** Days a `cold` row is kept before the retention purge may remove it. */
  RETENTION_DAYS: z.coerce.number().int().positive().default(365),
});

export type Env = z.infer<typeof EnvSchema> & {
  serviceAccount: ServiceAccount;
};

export interface ServiceAccount {
  client_email: string;
  private_key: string;
  [k: string]: unknown;
}

function loadServiceAccount(env: z.infer<typeof EnvSchema>): ServiceAccount {
  let raw: string | undefined = env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw && env.GOOGLE_SERVICE_ACCOUNT_FILE) {
    raw = readFileSync(env.GOOGLE_SERVICE_ACCOUNT_FILE, "utf8");
  }
  if (!raw) {
    throw new Error(
      "Provide the Google credentials via GOOGLE_SERVICE_ACCOUNT_JSON " +
        "or GOOGLE_SERVICE_ACCOUNT_FILE.",
    );
  }
  let parsed: ServiceAccount;
  try {
    parsed = JSON.parse(raw) as ServiceAccount;
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON.");
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error(
      "Service-account JSON is missing client_email or private_key.",
    );
  }
  // GitHub secrets often escape newlines in the private key; restore them.
  parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
  return parsed;
}

let cached: Env | null = null;

/** Parse and cache process.env. Throws a readable aggregate on failure. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached) return cached;
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const serviceAccount = loadServiceAccount(result.data);
  cached = { ...result.data, serviceAccount };
  return cached;
}

/** Test seam: clear the memoised env. */
export function resetEnvCache(): void {
  cached = null;
}
