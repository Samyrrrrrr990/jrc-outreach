# CLAUDE.md — working notes for this repo

JRC Outreach: a Google-Sheets-backed, GitHub-Actions-scheduled academic/sponsor
cold-outreach system. TypeScript, ESM, run via `tsx` (no build step). See
`README.md` for the operator guide and `agents.md`/`skills.md` for the original
spec.

## Commands

```bash
npm test           # vitest, no credentials required
npm run typecheck  # tsc --noEmit (strict)
npx tsx src/cli.ts preview profs      # render sample emails, zero config
npx tsx src/cli.ts doctor             # verify env + Sheets/SMTP/IMAP connectivity
npx tsx src/cli.ts verify             # probe scrape sources + robots + templates, no creds needed
npx tsx src/cli.ts run-daily --dry-run
npx tsx src/cli.ts run-replies --dry-run
```

## Architecture rules (keep these invariants)

- **The Sheet is the only source of truth for status.** No component keeps
  separate state. Every row write re-reads status immediately before writing
  (atomic-per-row guard in `sheets/crm.ts#patchContact`).
- **Pure logic vs. I/O.** All decision logic is pure and tested: `core/status.ts`
  (lifecycle), `mail/templates.ts` (merge), `mail/reply-match.ts` (reply
  matching), `scrape/email.ts` (de-obfuscation), `scrape/dedup.ts`,
  `sheets/schema.ts`. The Sheets/SMTP/IMAP modules are thin adapters — put new
  logic in the pure modules and unit-test it.
- **Fail loud.** Missing/invalid config throws (see `config/env.ts`). Unfilled
  merge fields throw (never send). Proof-point placeholders block live sends
  (`config/proofPoints.ts#assertProofPointsReady`). CLI exits non-zero on error.
- **Status vocabulary is fixed** (`core/types.ts#STATUSES`): new, emailed,
  followed_up, cold, replied, do_not_contact. A row with any other non-empty
  status is treated as malformed and skipped — do not add statuses without
  updating the enum and the lifecycle helpers together.
- **Never guess an email.** `scrape/email.ts` only decodes addresses actually
  present on the page; it must never construct one from a name pattern.

## Where things live

- Quotas / cadence / cap: `src/config/campaign.ts`
- Scrape targets: `src/config/sources.ts`
- Copy: `templates/*.md` (first line must be `Subject: ...`)
- Shared stats: `src/config/proofPoints.ts`
