/**
 * Failure alerting via the EXISTING SMTP account — no third-party service.
 * An alert goes to ALERT_EMAIL (default: the sender's own inbox) when a live
 * scheduled run fails outright, or completes with too many errors.
 *
 * Deliberately does NOT use loadEnv()/smtp.ts: those validate the full config
 * (Sheets, IMAP, ...), and a broken SHEET_ID is exactly the kind of failure we
 * need to be able to email about. Only the SMTP subset is required here.
 *
 * Alerts are best-effort: trySendAlert never throws, so a dead SMTP server
 * can't mask the original failure (the run still exits non-zero and the
 * workflow's `if: failure()` fallback step covers process-level crashes).
 */
import nodemailer from "nodemailer";
import { z } from "zod";
import { log } from "../core/logger";

export interface AlertDecision {
  enabled: boolean;
  dryRun: boolean;
  /** The run threw and is exiting non-zero. */
  fatal: boolean;
  /** Highest per-category error count for a run that completed. */
  errorCount: number;
  threshold: number;
}

/** Pure: alert only for live runs — fatal, or error count at/over threshold. */
export function shouldSendAlert(d: AlertDecision): boolean {
  if (!d.enabled || d.dryRun) return false;
  return d.fatal || d.errorCount >= d.threshold;
}

/**
 * Alerts default ON inside GitHub Actions (the "scheduled run" case) and OFF
 * locally; ALERT_ON_FAILURE=true/false overrides either way.
 */
export function alertsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const override = (env.ALERT_ON_FAILURE ?? "").trim().toLowerCase();
  if (["true", "1", "yes"].includes(override)) return true;
  if (["false", "0", "no"].includes(override)) return false;
  return env.GITHUB_ACTIONS === "true";
}

export function alertErrorThreshold(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number.parseInt(env.ALERT_ERROR_THRESHOLD ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/** Link to the failing Actions run, when we're inside one. */
export function actionsRunUrl(
  env: Partial<Record<"GITHUB_SERVER_URL" | "GITHUB_REPOSITORY" | "GITHUB_RUN_ID", string>> = process.env,
): string | undefined {
  const { GITHUB_SERVER_URL: server, GITHUB_REPOSITORY: repo, GITHUB_RUN_ID: id } = env;
  if (!server || !repo || !id) return undefined;
  return `${server}/${repo}/actions/runs/${id}`;
}

const MAX_ERROR_LINES = 20;

export interface AlertContent {
  job: string;
  kind: "fatal" | "errors";
  errors: string[];
  summaryLine?: string;
  runUrl?: string;
}

/** Pure: compose the alert email. Keep it plain text and skimmable. */
export function buildAlertEmail(a: AlertContent): { subject: string; text: string } {
  const subject =
    a.kind === "fatal"
      ? `[outreach] FAILED: ${a.job}`
      : `[outreach] ${a.job} completed with ${a.errors.length} error(s)`;

  const lines: string[] = [
    a.kind === "fatal"
      ? `The "${a.job}" run failed and exited non-zero.`
      : `The "${a.job}" run completed, but hit ${a.errors.length} error(s).`,
    "",
  ];
  if (a.summaryLine) lines.push(a.summaryLine, "");
  if (a.errors.length > 0) {
    lines.push("Errors:");
    for (const err of a.errors.slice(0, MAX_ERROR_LINES)) lines.push(`- ${err}`);
    if (a.errors.length > MAX_ERROR_LINES) {
      lines.push(`…and ${a.errors.length - MAX_ERROR_LINES} more`);
    }
    lines.push("");
  }
  if (a.runUrl) lines.push(`Run logs: ${a.runUrl}`);
  lines.push("", "— jrc-outreach alerting (sent via your own SMTP account)");
  return { subject, text: lines.join("\n") };
}

const boolish = z
  .string()
  .transform((v) => v.trim().toLowerCase())
  .pipe(z.enum(["true", "false", "1", "0", "yes", "no"]))
  .transform((v) => v === "true" || v === "1" || v === "yes");

/** The minimal env an alert needs — intentionally NOT the full EnvSchema. */
const AlertEnvSchema = z.object({
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive(),
  SMTP_SECURE: boolish.default("true"),
  SMTP_USER: z.string().min(1),
  SMTP_PASS: z.string().min(1),
  SENDER_NAME: z.string().min(1),
  SENDER_EMAIL: z.string().email(),
  ALERT_EMAIL: z.string().email().optional(),
});

/** Send an alert email over the existing SMTP account. Throws on failure. */
export async function sendAlertEmail(subject: string, text: string): Promise<void> {
  const env = AlertEnvSchema.parse(process.env);
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
  await transport.sendMail({
    from: { name: env.SENDER_NAME, address: env.SENDER_EMAIL },
    to: env.ALERT_EMAIL ?? env.SENDER_EMAIL,
    subject,
    text,
  });
}

/** Best-effort wrapper: logs instead of throwing, returns whether it sent. */
export async function trySendAlert(content: AlertContent): Promise<boolean> {
  const { subject, text } = buildAlertEmail({ ...content, runUrl: content.runUrl ?? actionsRunUrl() });
  try {
    await sendAlertEmail(subject, text);
    log.info("Alert email sent", { action: "alert", result: "sent", subject });
    return true;
  } catch (err) {
    log.error("Alert email could not be sent", {
      action: "alert",
      result: "failed",
      err: String(err),
    });
    return false;
  }
}
