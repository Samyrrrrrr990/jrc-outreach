# AGENTS.md — Task/Agent Breakdown

This project is built and operated as four cooperating jobs. They can be
built as literal Claude Code sub-agents, or simply as four scripts run in
sequence by GitHub Actions — either way, keep their responsibilities
separate and non-overlapping as described below.

---

## 1. Scraper Agent

**Goal**: keep the CRM stocked with fresh, real, deduped contacts.

**Responsibilities**
- Crawl public faculty/department "people" pages at UofT, TMU, York, Western
  for professor name + email + department
- Crawl public student club / research society pages at the same schools for
  student contacts
- Maintain and expand a curated seed list of sponsor targets (Canadian
  EdTech companies, STEM/education foundations, regional tech companies,
  plus long-shot big-name orgs with public CSR/partnership contact pages)
- Before inserting any row, check the CRM for an existing matching email —
  never insert a duplicate
- Tag every new row with `source_url` so a human can audit where it came from
- Stop scraping a category for the day once there are enough `new` rows to
  fill that day's quota (20 sponsors / 20 profs / 10 students) — no need to
  over-scrape

**Must NOT do**
- Scrape LinkedIn, or any site disallowed by robots.txt/ToS
- Guess/fabricate email addresses (e.g. pattern-guessing firstname.lastname@)
  without verifying the pattern against a real published example on that
  same domain
- Insert a row without a source_url

**Runs**: daily, before the Sender Agent, same GitHub Actions job

---

## 2. Sender Agent

**Goal**: send exactly today's quota of real, personalized, compliant emails.

**Responsibilities**
- Pull up to 20 sponsor / 20 professor / 10 student rows where `status = new`
- Merge each into the correct category template, filling in real
  personalization fields (name, org, field/dept) — never send a template
  with an unfilled placeholder
- Send via Privatemail SMTP
- Append a copy to the Sent folder via IMAP so it shows in the real sent
  folder
- Update the CRM row: `status = emailed`, `date_emailed = today`
- Respect the 50/day hard cap under all circumstances, even if more `new`
  rows exist
- Support `--dry-run`: log the fully rendered email and intended CRM update
  without sending or writing anything

**Must NOT do**
- Send to any row not in `new` status
- Send more than the category quota
- Send a template with a missing/broken merge field

**Runs**: daily, after the Scraper Agent, same GitHub Actions job

---

## 3. Reply-Check Agent

**Goal**: detect real replies accurately, never miss one, never false-positive.

**Responsibilities**
- Connect via IMAP to the inbox
- Match incoming mail to CRM rows using Message-ID / References / In-Reply-To
  headers tied to the original sent message (not keyword or subject-line
  guessing)
- On match: set `status = replied`, `replied_at = now`, and ensure this
  contact is excluded from all future follow-up logic permanently
- Log any ambiguous/unmatched incoming mail for manual review rather than
  guessing

**Must NOT do**
- Mark something "replied" based on subject-line similarity alone
- Auto-respond to replies (a human should read and respond to real replies)

**Runs**: every few hours, separate GitHub Actions workflow

---

## 4. Follow-Up Agent

**Goal**: one polite, well-timed nudge — then silence.

**Responsibilities**
- Find rows where `status = emailed` and `date_emailed` is 3+ days ago
- Send a short follow-up (not a repeat of the original email — a brief bump
  referencing the original ask)
- Update `status = followed_up`, `last_followup = today`
- Find rows where `status = followed_up` and enough time has passed again
  (e.g. another 5 days) with no reply → set `status = cold` and stop forever
- Never touch a row with `status = replied` or `do_not_contact`

**Must NOT do**
- Send more than one follow-up per contact, ever
- Follow up on anyone who replied or opted out

**Runs**: daily, can be combined with the Reply-Check job

---

## Shared invariants (all agents must respect)

- The Google Sheet is the only source of truth for status — no agent keeps
  its own separate state
- Every write to the Sheet is atomic per-row (read current status
  immediately before writing, to avoid race conditions if jobs overlap)
- Every agent logs what it did (scraped N, sent N, replies detected N,
  follow-ups sent N) so a human can audit the day's run
- `do_not_contact` is permanent and checked first, before any other logic