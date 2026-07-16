# SKILLS.md — Technical Capabilities This Project Needs

This isn't a list of Anthropic "Skills" — it's the set of technical
capabilities Claude Code needs to implement and get right for this project.
Treat each as a small, testable module.

## 1. Google Sheets as CRM

- Auth via a Google service account (JSON key stored as a GitHub Actions
  secret, never committed to the repo)
- Read: fetch all rows for a given tab (Profs/Sponsors/Students), filter by
  status in code (simplest and most debuggable) rather than complex Sheets
  formulas
- Write: update a single row's status/timestamp fields without disturbing
  other columns
- Append: add new scraped rows to the correct tab
- Must handle: empty sheet on first run, malformed rows (missing email),
  and rate limits (Sheets API has quotas — batch reads/writes where possible)

## 2. HTML scraping of public directory pages

- Fetch + parse static HTML (cheerio/BeautifulSoup) for department/faculty
  "people" pages
- Extract: name, email (mailto: links or displayed text), department/field
- Handle obfuscated emails (e.g. "name [at] utoronto [dot] ca") — decode
  common obfuscation patterns, but never guess an email that isn't actually
  present on the page in some form
- Respect robots.txt — check it before crawling a new domain, skip if
  disallowed
- Rate-limit requests to any single domain (e.g. 1 request/second) to be a
  good citizen

## 3. SMTP sending (Privatemail)

- Use a standard SMTP library (`nodemailer` in Node) with Privatemail's SMTP
  host/port/credentials from secrets
- Set proper headers: From (real sender), Reply-To, a unique Message-ID
  (needed for reply matching later), List-Unsubscribe header
- Plain-text + simple HTML fallback (keep it simple — a personal-looking
  email should look like plain text, not a marketing template)

## 4. IMAP: Sent-folder append + inbox reply detection

- After sending via SMTP, APPEND the sent message to the account's Sent
  folder over IMAP so it appears in the real sent folder
- Separately, poll the inbox (or use IDLE if the library supports it) and
  match new mail against previously sent Message-IDs via the
  References/In-Reply-To headers
- Store the mapping of `contact_email → sent Message-ID` somewhere
  retrievable (a column in the CRM row is simplest) so reply matching
  doesn't require re-deriving it

## 5. Templating / mail-merge

- Simple template files (Markdown or plain text with `{{field}}` placeholders)
- A merge function that fails loudly (throws, doesn't send) if any
  placeholder is left unfilled after merge
- A single shared "proof points" data module so stats are consistent and
  easy to update in one place

## 6. Scheduling & secrets (GitHub Actions)

- Cron-scheduled workflow(s): one daily job for scrape+send, one more
  frequent job for reply-check+follow-up
- All credentials (Privatemail SMTP/IMAP, Google service account JSON) go in
  repo secrets, never in code or logs
- Workflow should fail loudly (visible failed run) if any step errors,
  rather than silently skipping a day

## 7. Dedup / idempotency logic

- Before any insert: check email doesn't already exist in that tab
- Before any send: check status is exactly `new`
- Safe to re-run the same day's job twice without double-sending (i.e. the
  second run should find nothing left in `new` status if the first run
  succeeded)

## 8. Logging & dry-run

- Every module supports a dry-run/verbose mode
- Daily summary log (console output, or optionally appended to a "Log" tab
  in the same Sheet): contacts scraped, emails sent per category, replies
  detected, follow-ups sent