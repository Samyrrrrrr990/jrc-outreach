/**
 * Repo-wide secret scan (the I/O around secretScan.ts). Scans git-tracked
 * files, so anything .gitignored (.env, key files) is out of scope by
 * definition — the point is catching what WOULD be committed.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { log } from "../core/logger";
import { scanContent, type SecretFinding } from "./secretScan";

const SKIP_PATHS: RegExp[] = [
  /^node_modules\//,
  /^docs\//, // generated dashboard output (aggregates only)
  // The scanner's own unit tests contain fixture "secrets" by design.
  /^test\/secretScan\.test\.ts$/,
  /\.(png|jpe?g|gif|ico|pdf|woff2?)$/i,
];

function trackedFiles(): string[] {
  const out = execFileSync("git", ["ls-files"], { encoding: "utf8" });
  return out.split("\n").filter(Boolean);
}

export function runSecretScan(): SecretFinding[] {
  const findings: SecretFinding[] = [];
  for (const file of trackedFiles()) {
    if (SKIP_PATHS.some((re) => re.test(file))) continue;
    let content: string;
    try {
      content = readFileSync(file, "utf8");
    } catch {
      continue; // deleted-but-staged or unreadable; nothing to scan
    }
    findings.push(...scanContent(content, file));
  }
  return findings;
}

/** CLI entry: report findings (never their content) and fail the build. */
export function runSecretScanOrThrow(): void {
  const findings = runSecretScan();
  if (findings.length === 0) {
    log.info("Secret scan clean", { action: "scan-secrets", result: "ok" });
    return;
  }
  for (const f of findings) {
    log.error(`possible secret: ${f.file}:${f.line} (${f.rule})`, {
      action: "scan-secrets",
      result: "finding",
      rule: f.rule,
    });
  }
  throw new Error(
    `scan-secrets found ${findings.length} possible secret(s). ` +
      "Remove them (and rotate anything real) before committing.",
  );
}
