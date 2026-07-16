import { describe, it, expect } from "vitest";
import {
  actionsRunUrl,
  buildAlertEmail,
  shouldSendAlert,
} from "../src/mail/alerts";

describe("shouldSendAlert", () => {
  const base = { enabled: true, dryRun: false, fatal: false, errorCount: 0, threshold: 1 };

  it("alerts on a fatal failure of a live run", () => {
    expect(shouldSendAlert({ ...base, fatal: true })).toBe(true);
  });

  it("alerts when the error count reaches the threshold", () => {
    expect(shouldSendAlert({ ...base, errorCount: 1 })).toBe(true);
    expect(shouldSendAlert({ ...base, errorCount: 5, threshold: 3 })).toBe(true);
  });

  it("stays quiet below the threshold", () => {
    expect(shouldSendAlert({ ...base, errorCount: 2, threshold: 3 })).toBe(false);
  });

  it("never alerts for dry runs or when disabled", () => {
    expect(shouldSendAlert({ ...base, fatal: true, dryRun: true })).toBe(false);
    expect(shouldSendAlert({ ...base, fatal: true, enabled: false })).toBe(false);
  });
});

describe("buildAlertEmail", () => {
  it("composes a fatal-failure alert with the run URL", () => {
    const { subject, text } = buildAlertEmail({
      job: "run-daily",
      kind: "fatal",
      errors: ["Invalid environment configuration: SHEET_ID"],
      runUrl: "https://github.com/me/repo/actions/runs/42",
    });
    expect(subject).toMatch(/FAILED/);
    expect(subject).toContain("run-daily");
    expect(text).toContain("Invalid environment configuration");
    expect(text).toContain("https://github.com/me/repo/actions/runs/42");
  });

  it("composes a completed-with-errors alert including the summary line", () => {
    const { subject, text } = buildAlertEmail({
      job: "reply+followup",
      kind: "errors",
      summaryLine: "job=reply+followup sent=0 errors=3",
      errors: ["a", "b", "c"],
    });
    expect(subject).toContain("3 error(s)");
    expect(text).toContain("job=reply+followup");
    expect(text).toContain("- a");
  });

  it("truncates very long error lists", () => {
    const errors = Array.from({ length: 50 }, (_, i) => `err ${i}`);
    const { text } = buildAlertEmail({ job: "run-daily", kind: "errors", errors });
    expect(text).toContain("err 0");
    expect(text).not.toContain("err 49");
    expect(text).toMatch(/30 more/);
  });
});

describe("actionsRunUrl", () => {
  it("builds the run URL from GitHub Actions env vars", () => {
    expect(
      actionsRunUrl({
        GITHUB_SERVER_URL: "https://github.com",
        GITHUB_REPOSITORY: "me/repo",
        GITHUB_RUN_ID: "42",
      }),
    ).toBe("https://github.com/me/repo/actions/runs/42");
  });

  it("returns undefined outside Actions", () => {
    expect(actionsRunUrl({})).toBeUndefined();
  });
});
