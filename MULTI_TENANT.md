# MULTI_TENANT.md — running this for another chapter / org

The engine (scrape → dedupe → send → reply-match → follow-up → analytics) is
org-agnostic: everything org-specific lives in **one profile file** plus **one
templates folder**. A unit test (`test/multi-tenant.test.ts`) enforces that no
engine file mentions any org; the shipped `demo` profile proves a second org
runs from config alone.

## What a new org must supply

| Thing | Where it goes | Notes |
|---|---|---|
| **Org profile** | `src/config/profiles/<org>.ts` + register it in `profiles/index.ts` | Copy `demo.ts`. Proof points, quotas, cadence, scrape sources, templates folder, User-Agent. |
| **Email templates** | `templates/<org>/` (6 files) | `profs/sponsors/students` × `initial/followup`, first line `Subject: ...`. Optional A/B files: `<base>.variant-<id>.md`. |
| **Proof points** | inside the profile | Real, verifiable numbers only. Every value ships as `«placeholder»` and **live sends refuse to run until all are replaced**. |
| **Source list** | inside the profile | Public directory pages + curated sponsor seeds only. robots.txt is enforced at runtime; never hand-enter a guessed email. Run `npx tsx src/cli.ts verify` after editing. |
| **Daily quota** | inside the profile | Per-category quotas + `dailyCap`. The 50/day cap is the engine-wide ceiling — profiles may only go lower. |
| **CRM Sheet** | Google Sheets | One spreadsheet per org. Create it, share it with the org's service account (Editor). Tabs + headers are created automatically on first run. |
| **Google service account** | deployment secret | Own Cloud project or a shared one; the JSON key goes in `GOOGLE_SERVICE_ACCOUNT_JSON`. |
| **SMTP/IMAP creds** | deployment secrets | The org's own mailbox. Sender identity (`SENDER_NAME`, `SENDER_EMAIL`) is deliberately env-based, not profile-based — it belongs with the credentials that authenticate it. |

## How to run as a given org

One codebase, selected by env var:

```bash
ORG_PROFILE=demo npx tsx src/cli.ts preview profs   # works today, zero config
ORG_PROFILE=<org> npx tsx src/cli.ts doctor
ORG_PROFILE=<org> npx tsx src/cli.ts run-daily --dry-run
```

## Deployment model: one fork (or repo) per org

Each org runs its **own** GitHub repository (fork or copy) with its **own**
repository secrets and its own Sheet, and sets `ORG_PROFILE=<org>` in the
workflow env (add one line to each workflow's `env:` block, or a repository
variable). Why not one repo running many orgs?

- Secrets isolation: chapter B's operators should not be able to exfiltrate
  chapter A's SMTP password by editing a workflow.
- Blast radius: a bad edit in one chapter can't spam from another's identity.
- The free tier is per-repo/per-account, so quotas don't compete.

## Safety rails that hold for every org (engine-level, not per-profile)

- 50/day hard cap ceiling; one follow-up ever; dedup on every insert AND at
  send-time; `do_not_contact` is permanent and checked first.
- `«placeholder»` proof points block live sends (`assertProofPointsReady`).
- robots.txt enforced at runtime; 1 req/s per domain; truthful User-Agent.
- Never guess an email address — only addresses actually published on a page.
- Dry-run by default in every workflow's manual trigger; `DRY_RUN=1` works
  everywhere.

## Onboarding checklist

1. Fork/copy the repo; `npm install && npm test`.
2. Create the profile file + templates folder (copy `demo`); register it in
   `src/config/profiles/index.ts`; set `production: true` once the proof
   points are real (CI fails a production profile that still has `«»`).
3. Create the Sheet + service account; fill repository secrets
   (same names as `.env.example`).
4. Set `ORG_PROFILE` in the three scheduled workflows' `env:` blocks.
5. `npx tsx src/cli.ts doctor`, then `verify`, then `run-daily --dry-run`.
6. Flip to live by triggering the workflow without the dry-run toggle.
