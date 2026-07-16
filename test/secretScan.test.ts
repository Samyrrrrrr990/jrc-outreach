import { describe, it, expect } from "vitest";
import { scanContent } from "../src/security/secretScan";

describe("scanContent", () => {
  it("catches a private key block", () => {
    const hits = scanContent("x\n-----BEGIN PRIVATE KEY-----\nMIIE...\n", "key.pem");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.rule).toMatch(/private-key/);
  });

  it("catches a Google API key and a GitHub token", () => {
    expect(scanContent(`const k = "AIzaSyA${"a".repeat(33)}";`, "x.ts")).not.toEqual([]);
    expect(scanContent(`token: ghp_${"A1".repeat(18)}Q`, "x.yml")).not.toEqual([]);
  });

  it("catches a hardcoded password assignment", () => {
    expect(scanContent(`SMTP_PASS=hunter2hunter2`, ".env.bak")).not.toEqual([]);
    expect(scanContent(`const IMAP_PASS = "s3cr3tpassword!"`, "x.ts")).not.toEqual([]);
  });

  it("catches service-account JSON material", () => {
    expect(
      scanContent(`{"type": "service_account", "project_id": "x"}`, "sa.json"),
    ).not.toEqual([]);
  });

  it("ignores the legitimate patterns this repo actually uses", () => {
    const legit = [
      `SMTP_PASS=`, // empty .env.example line
      `SMTP_PASS: \${{ secrets.SMTP_PASS }}`, // workflow indirection
      `SMTP_PASS: z.string().min(1),`, // zod schema
      `auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },`, // code reading env
      `# SMTP_PASS is a repository secret`, // docs
      `PASSWORD=«fill-me-in»`, // placeholder sentinel
      `TOKEN=your-token-here`, // docs placeholder
    ];
    for (const line of legit) {
      expect(scanContent(line, "any.ts"), line).toEqual([]);
    }
  });

  it("reports the line number of the finding, never the secret itself", () => {
    const hits = scanContent(`ok\nok\nSMTP_PASS=verysecretvalue123\n`, "x.sh");
    expect(hits[0]!.line).toBe(3);
    expect(JSON.stringify(hits)).not.toContain("verysecretvalue123");
  });
});
