# JRC Outreach

Automated, **compliant** academic + sponsor outreach, driven by a Google Sheet
and run on GitHub Actions. It scrapes public directory pages for real contacts,
sends a small daily quota of personalized emails, records everything in the
Sheet, detects genuine replies, and sends exactly one polite follow-up before
going quiet.

The Google Sheet is the **single source of truth** for every contact's status.
No component keeps its own separate state.

---

## What it does, in one picture

```
                        ┌─────────────────────────────────────────┐
   daily cron           │            Google Sheet (CRM)           │
  ┌──────────┐  read    │  Profs | Sponsors | Students | Log      │
  │ run-daily│ ───────► │                                         │
  │ scrape + │ ◄─────── │  status: new → emailed → followed_up →  │
  │  send    │  write   │          cold   (replied / do_not_      │
  └──────────┘          │                  contact are terminal)  │
                        │                                         │
  ┌──────────┐  read    │                                         │
  │run-replies│ ──────► │                                         │
  │ replies + │ ◄────── │                                         │
  │ follow-up │  write   └─────────────────────────────────────────┘
  └──────────┘
  every 4h        SMTP send ─► Privatemail ─► IMAP APPEND to Sent
                  IMAP inbox ─► match In-Reply-To / References ─► replied
```

Four responsibilities (see `agents.md`), implemented as pure logic + thin I/O:

| Job | Command | Schedule |
|-----|---------|----------|
| Scraper — restock the CRM with fresh, deduped, provenance-tagged contacts | part of `run-daily` | daily |
| Sender — send today's quota of personalized initial emails | part of `run-daily` | daily |
| Reply-check — match inbox mail to sent Message-IDs, mark `replied` | part of `run-replies` | every 4h |
| Follow-up — one nudge after 3 days, then `cold` after 5 more | part of `run-replies` | every 4h |

Quotas: **20 sponsors + 20 profs + 10 students per day**, hard-capped at **50/day** total.

---

## Setup

### 1. Install

```bash
npm install
npm test          # 70 unit tests, no credentials needed
npm run typecheck
```

### 2. Fill in your details (two files)

- **`src/config/proofPoints.ts`** — your program name, stats, and website.
  Every value ships as a `«placeholder»`. **Real sends refuse to run until all
  placeholders are replaced** — this is a safety gate so you can never
  accidentally email a fabricated statistic.
- **`templates/*.md`** — the six email templates (initial + follow-up per
  category). Edit freely; the first line must stay `Subject: ...`. Any
  `{{placeholder}}` you leave unfilled will throw at send time, never send a
  broken email.

Preview the rendered copy with zero setup:

```bash
npx tsx src/cli.ts preview profs      # or sponsors / students
```

### 3. Add scrape targets

Edit **`src/config/sources.ts`**:

- `DIRECTORY_SOURCES` — public faculty/department/club people-pages (UofT, TMU,
  York, Western…). If a page needs precise extraction, add CSS `selectors`;
  otherwise the generic mailto/`[at]`/`[dot]` scanner is used.
- `SPONSOR_SEEDS` — curated sponsor targets, each with a known public email or a
  contact page to scrape, plus a `source_url` for provenance.

The example entries use `example.edu`/`example.com` and yield nothing — replace
them. `robots.txt` is enforced at runtime regardless of what you list, requests
are rate-limited to 1/second per domain, and **no email is ever guessed** — only
addresses actually present on the page are used.

### 4. Google Sheets

1. Create a Google Cloud service account and download its JSON key.
2. Enable the **Google Sheets API** for that project.
3. Create a spreadsheet. Share it with the service account's `client_email`
   (Editor). Copy the spreadsheet ID from its URL.
4. The tabs (`Profs`, `Sponsors`, `Students`, `Log`) and their headers are
   created automatically on first run.

### 5. Configure secrets

Copy `.env.example` to `.env` for local runs; set the same keys as **repository
secrets** for GitHub Actions. Verify everything connects:

```bash
npx tsx src/cli.ts doctor    # checks env, proof points, Sheets, SMTP, IMAP
```

---

## Running

```bash
# Dry run — logs every rendered email and intended Sheet update, sends/writes nothing.
# (Still reads the Sheet, so it needs credentials configured.)
npx tsx src/cli.ts run-daily --dry-run
npx tsx src/cli.ts run-replies --dry-run

# For real:
npx tsx src/cli.ts run-daily
npx tsx src/cli.ts run-replies

# Individual phases:
npx tsx src/cli.ts scrape
npx tsx src/cli.ts send
```

On GitHub Actions the two workflows run on cron and can also be triggered
manually (with a `dry_run` toggle) from the Actions tab. They share a
`concurrency` lock so a daily run and a reply run never race on the Sheet.

---

## The Sheet schema

Each contact tab has these columns (row 1 is the header, created for you):

```
email | name | org | field | source_url | status | date_scraped |
date_emailed | replied_at | last_followup | date_cold | message_id | notes
```

**Status lifecycle** (the only values that are valid — a typo in this column is
treated as malformed and skipped, so it can never accidentally be emailed):

- `new` → freshly scraped, never contacted
- `emailed` → initial email sent (`date_emailed`, `message_id` recorded)
- `followed_up` → the one permitted follow-up was sent (`last_followup`)
- `cold` → no reply after the follow-up window; stop forever (`date_cold`)
- `replied` → a real reply was detected (`replied_at`); terminal
- `do_not_contact` → permanent opt-out; **checked before any other logic**

To opt someone out, set their `status` to `do_not_contact` by hand — nothing
will ever touch that row again.

---

## Design guarantees

- **Idempotent / re-run safe.** Quotas are measured against how many were
  already emailed *today*, so running a job twice in one day never double-sends.
- **Never sends fabricated stats.** The proof-points gate throws before a live
  send until every placeholder is replaced.
- **Never sends a broken email.** The merge engine throws (does not send) on any
  unfilled `{{placeholder}}`, treating empty values as unfilled.
- **Faithful Sent folder.** The MIME is composed once — with a Message-ID we
  control — and the *identical bytes* are both sent over SMTP and APPENDed to the
  Sent folder over IMAP.
- **Reply detection is header-based**, matching `In-Reply-To`/`References`
  against stored Message-IDs — never subject/keyword guessing. Mail from a known
  contact that lacks a matching header is flagged for manual review, not
  auto-marked.
- **Fails loud.** Missing secrets, bad config, or any step error exits non-zero,
  turning the Actions run red instead of silently skipping a day.
- **Good web citizen.** robots.txt is honored, requests are rate-limited per
  domain, a truthful User-Agent is sent, and every scraped row carries a
  `source_url` you can audit.

---

## Project layout

```
src/
  config/    env (zod-validated), campaign quotas, proof points, scrape sources
  core/      types, dates, status lifecycle (pure), logger + run summary
  scrape/    email de-obfuscation, robots.txt, rate-limited fetcher, cheerio parser, dedup
  mail/      mail-merge, headers, SMTP compose/send, IMAP append/read, reply-matching (pure)
  sheets/    schema mapping (pure), Sheets client, CRM operations
  pipeline/  scrape+send job, reply+follow-up job, send helpers
  cli.ts     entry point: run-daily | run-replies | scrape | send | preview | doctor
templates/   the six email templates
test/        70 unit tests over every pure module
.github/workflows/  daily-outreach.yml, reply-check.yml
```

All business logic lives in pure, unit-tested functions; the network adapters
(Sheets/SMTP/IMAP) are thin wrappers around them.
