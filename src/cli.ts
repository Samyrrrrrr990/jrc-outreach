/**
 * Command-line entry point. Every command supports --dry-run (also DRY_RUN=1)
 * and --verbose. Exits non-zero on failure so a GitHub Actions run turns red
 * rather than silently skipping a day (SKILLS.md §6/§8).
 *
 *   tsx src/cli.ts <command> [--dry-run] [--verbose]
 *
 * Commands:
 *   run-daily     scrape + send today's initial-email quota
 *   run-replies   detect replies + send follow-ups + retire cold rows
 *   scrape        scrape only
 *   send          send initial emails only
 *   doctor        verify configuration and connectivity, change nothing
 *   help          show this text
 */
import { existsSync } from "node:fs";
import { configureLogger, log } from "./core/logger";

const COMMANDS = [
  "run-daily",
  "run-replies",
  "scrape",
  "send",
  "preview",
  "doctor",
  "help",
] as const;
type Command = (typeof COMMANDS)[number];

function loadDotEnv(): void {
  // Node 20.12+/22 native .env loader; only for local runs.
  if (existsSync(".env") && typeof process.loadEnvFile === "function") {
    try {
      process.loadEnvFile(".env");
    } catch {
      /* ignore */
    }
  }
}

function parseArgs(argv: string[]): {
  command: string;
  rest: string[];
  dryRun: boolean;
  verbose: boolean;
} {
  const args = argv.slice(2);
  const flags = new Set(args.filter((a) => a.startsWith("--")));
  const positional = args.filter((a) => !a.startsWith("--"));
  const command = positional[0] ?? "help";
  const dryRun =
    flags.has("--dry-run") ||
    ["1", "true", "yes"].includes((process.env.DRY_RUN ?? "").toLowerCase());
  return {
    command,
    rest: positional.slice(1),
    dryRun,
    verbose: flags.has("--verbose"),
  };
}

/** Render sample emails for a category with zero configuration. */
async function preview(categoryArg: string | undefined): Promise<void> {
  const { CATEGORIES } = await import("./core/types");
  const { categoryConfig } = await import("./config/campaign");
  const { PROOF_POINTS } = await import("./config/proofPoints");
  const { loadTemplate, render, varsFor } = await import("./mail/templates");

  const cat = (categoryArg ?? "profs") as (typeof CATEGORIES)[number];
  if (!CATEGORIES.includes(cat)) {
    throw new Error(`Unknown category "${categoryArg}". Use: ${CATEGORIES.join(", ")}`);
  }

  const samples = {
    profs: { name: "Dr. Ada Lovelace", org: "University of Toronto", field: "Computer Science", email: "ada@utoronto.ca" },
    sponsors: { name: "Partnerships Team", org: "Acme EdTech", field: "K-12 STEM education", email: "partners@acme.example" },
    students: { name: "Robotics Society", org: "York University", field: "robotics", email: "club@yorku.ca" },
  } as const;
  const s = samples[cat];

  // Show placeholders visibly instead of throwing, so the layout is previewable.
  const pp: Record<string, string> = {};
  for (const [k, v] of Object.entries(PROOF_POINTS)) {
    pp[k] = v.includes("«") ? `[[FILL:${k}]]` : v;
  }

  const contact = {
    email: s.email, name: s.name, org: s.org, field: s.field,
    source_url: "https://example", status: "new" as const,
    date_scraped: "", date_emailed: "", replied_at: "",
    last_followup: "", date_cold: "", message_id: "", notes: "",
  };
  const vars = varsFor(contact, { name: "Your Name", email: "you@yourdomain.org" }, pp);

  const cfg = categoryConfig(cat);
  for (const file of [cfg.initialTemplate, cfg.followUpTemplate]) {
    const { subject, text } = render(loadTemplate(file), vars);
    log.info(`\n===== ${file} =====\nSubject: ${subject}\n\n${text}`);
  }
}

function usage(): void {
  log.info(
    "Usage: tsx src/cli.ts <command> [--dry-run] [--verbose]\n" +
      `  commands: ${COMMANDS.join(", ")}\n` +
      "  preview takes a category: preview profs | preview sponsors | preview students",
  );
}

async function doctor(): Promise<void> {
  const { loadEnv } = await import("./config/env");
  const { proofPointsReady } = await import("./config/proofPoints");
  const { verifySmtp } = await import("./mail/smtp");
  const { verifyImap } = await import("./mail/imap");
  const { listTabs } = await import("./sheets/client");

  const checks: Array<[string, () => Promise<void>]> = [
    ["env", async () => void loadEnv()],
    [
      "proof-points",
      async () => {
        if (!proofPointsReady()) {
          throw new Error("proof points still contain «placeholders»");
        }
      },
    ],
    ["sheets", async () => void (await listTabs())],
    ["smtp", async () => await verifySmtp()],
    ["imap", async () => await verifyImap()],
  ];

  let failed = 0;
  for (const [name, fn] of checks) {
    try {
      await fn();
      log.info(`✓ ${name}`);
    } catch (err) {
      failed++;
      log.error(`✗ ${name}: ${String(err instanceof Error ? err.message : err)}`);
    }
  }
  if (failed > 0) throw new Error(`${failed} doctor check(s) failed`);
  log.info("All checks passed.");
}

async function main(): Promise<void> {
  loadDotEnv();
  const { command, rest, dryRun, verbose } = parseArgs(process.argv);
  configureLogger({ level: verbose ? "debug" : "info", dryRun });

  if (command === "help" || !COMMANDS.includes(command as Command)) {
    usage();
    if (command !== "help") process.exitCode = 1;
    return;
  }

  log.info(`Starting "${command}"${dryRun ? " (dry-run)" : ""}`);

  switch (command as Command) {
    case "run-daily": {
      const { runDaily } = await import("./pipeline/scrapeAndSend");
      await runDaily(dryRun);
      break;
    }
    case "run-replies": {
      const { runReplies } = await import("./pipeline/replyAndFollowup");
      await runReplies(dryRun);
      break;
    }
    case "scrape": {
      const { runScrape } = await import("./pipeline/scrapeAndSend");
      await runScrape(dryRun);
      break;
    }
    case "send": {
      const { runSend } = await import("./pipeline/scrapeAndSend");
      await runSend(dryRun);
      break;
    }
    case "preview":
      await preview(rest[0]);
      break;
    case "doctor":
      await doctor();
      break;
    case "help":
      usage();
      break;
  }
}

main().catch((err) => {
  log.error(`FATAL: ${String(err instanceof Error ? err.stack ?? err.message : err)}`);
  process.exitCode = 1;
});
