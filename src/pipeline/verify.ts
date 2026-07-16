/**
 * `verify` — config-health check that sends NOTHING and writes NOTHING.
 * Confirms every DIRECTORY_SOURCE / SPONSOR_SEED URL still responds with HTML
 * over HTTP 2xx and passes robots.txt, validates seed emails offline, and
 * renders every template against sample data. Dead sources surface here, in a
 * cheap weekly run, instead of silently wasting a scheduled scrape cycle.
 */
import { CAMPAIGN } from "../config/campaign";
import {
  DIRECTORY_SOURCES,
  SPONSOR_SEEDS,
  type DirectorySource,
  type SponsorSeed,
} from "../config/sources";
import { CATEGORIES } from "../core/types";
import { categoryConfig } from "../config/campaign";
import { proofPointsReady } from "../config/proofPoints";
import { log, setLogPhase } from "../core/logger";
import { withRetry } from "../core/retry";
import { TEMPLATE_DIR, loadTemplate, render, varsFor } from "../mail/templates";
import { listVariantIds, templateForVariant } from "../mail/variants";
import { looksLikeEmail } from "../scrape/email";
import { isAllowed } from "../scrape/robots";

export interface VerifyTarget {
  label: string;
  /** URL to probe — or, for kind "email", the address to validate offline. */
  url: string;
  kind: "directory" | "sponsor" | "email";
}

export interface TargetResult {
  target: VerifyTarget;
  ok: boolean;
  status?: number;
  error?: string;
}

/** Pure: flatten sources into probe targets, deduped by URL. */
export function collectTargets(
  dirs: DirectorySource[],
  seeds: SponsorSeed[],
): VerifyTarget[] {
  const out: VerifyTarget[] = [];
  const seen = new Set<string>();
  for (const d of dirs) {
    if (seen.has(d.url)) continue;
    seen.add(d.url);
    out.push({ label: d.label, url: d.url, kind: "directory" });
  }
  for (const s of seeds) {
    if (s.contactUrl) {
      if (seen.has(s.contactUrl)) continue;
      seen.add(s.contactUrl);
      out.push({ label: `${s.org} (sponsor)`, url: s.contactUrl, kind: "sponsor" });
    } else if (s.email) {
      out.push({ label: `${s.org} (sponsor)`, url: s.email, kind: "email" });
    }
  }
  return out;
}

export interface VerifySummary {
  ok: boolean;
  failures: TargetResult[];
  line: string;
}

/** Pure: fold probe results into a pass/fail summary. */
export function summarize(results: TargetResult[]): VerifySummary {
  const failures = results.filter((r) => !r.ok);
  const okCount = results.length - failures.length;
  return {
    ok: failures.length === 0,
    failures,
    line: `verify: ${okCount} ok, ${failures.length} failed of ${results.length} target(s)`,
  };
}

/** Probe one URL: robots.txt first, then a polite GET expecting HTML 2xx. */
async function probeTarget(target: VerifyTarget): Promise<TargetResult> {
  if (target.kind === "email") {
    return looksLikeEmail(target.url)
      ? { target, ok: true }
      : { target, ok: false, error: `invalid seed email "${target.url}"` };
  }

  if (!(await isAllowed(target.url))) {
    return { target, ok: false, error: "robots.txt disallows crawling" };
  }

  try {
    const res = await withRetry(
      async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        try {
          return await fetch(target.url, {
            headers: {
              "User-Agent": CAMPAIGN.userAgent,
              Accept: "text/html,application/xhtml+xml",
            },
            redirect: "follow",
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timer);
        }
      },
      { attempts: 2 },
    );
    if (!res.ok) {
      return { target, ok: false, status: res.status, error: `HTTP ${res.status}` };
    }
    const ctype = res.headers.get("content-type") ?? "";
    if (!ctype.includes("html")) {
      return { target, ok: false, status: res.status, error: `non-HTML (${ctype})` };
    }
    return { target, ok: true, status: res.status };
  } catch (err) {
    return { target, ok: false, error: String(err) };
  }
}

/** Render every category's templates with sample data; collect breakage. */
function checkTemplates(): string[] {
  const problems: string[] = [];
  const sample = {
    email: "sample@example.org", name: "Sample Name", org: "Sample Org",
    field: "Sample Field", source_url: "https://example.org",
    status: "new" as const, date_scraped: "", date_emailed: "",
    replied_at: "", last_followup: "", date_cold: "", message_id: "", notes: "",
  };
  for (const cat of CATEGORIES) {
    const cfg = categoryConfig(cat);
    const variantFiles = listVariantIds(TEMPLATE_DIR, cfg.initialTemplate).map((id) =>
      templateForVariant(cfg.initialTemplate, id),
    );
    for (const file of [cfg.initialTemplate, cfg.followUpTemplate, ...variantFiles]) {
      try {
        render(loadTemplate(file), varsFor(sample, { name: "Sender", email: "s@example.org" }));
      } catch (err) {
        problems.push(`template ${file}: ${String(err)}`);
      }
    }
  }
  return problems;
}

/** Run all checks; log a report; throw (non-zero exit) if anything failed. */
export async function runVerify(): Promise<void> {
  setLogPhase("verify");
  const targets = collectTargets(DIRECTORY_SOURCES, SPONSOR_SEEDS);
  const results: TargetResult[] = [];
  for (const target of targets) {
    const r = await probeTarget(target);
    results.push(r);
    log[r.ok ? "info" : "warn"](`${r.ok ? "OK " : "DEAD"} ${target.label}`, {
      action: "probe",
      result: r.ok ? "ok" : "failed",
      url: target.url,
      ...(r.status !== undefined ? { status: r.status } : {}),
      ...(r.error ? { err: r.error } : {}),
    });
  }

  const templateProblems = checkTemplates();
  for (const p of templateProblems) {
    log.warn(p, { action: "template-check", result: "failed" });
  }
  if (!proofPointsReady()) {
    log.warn("proof points still contain «placeholders» — live sends will refuse", {
      action: "proof-points",
      result: "unfilled",
    });
  }

  const s = summarize(results);
  log.info(s.line, { action: "verify", result: s.ok ? "ok" : "failed" });
  setLogPhase(null);

  const problems = [
    ...s.failures.map((f) => `${f.target.label} (${f.target.url}): ${f.error}`),
    ...templateProblems,
  ];
  if (problems.length > 0) {
    throw new Error(`verify failed:\n  - ${problems.join("\n  - ")}`);
  }
}
