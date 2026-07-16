# DATA_RETENTION.md — what the CRM keeps, and for how long

The Sheet holds personal data (names + emails of real people scraped from
public pages). Once this runs for months, that data must not accumulate
forever. This is the policy, and the machinery that implements it.

## What is stored, where

| Store | Contents | Personal data? |
|---|---|---|
| CRM tabs (Profs/Sponsors/Students) | name, email, org, field, source_url, lifecycle timestamps | **Yes** |
| Log tab | per-run aggregate counts | No |
| `docs/` dashboard + `data.json` | aggregate metrics only | No — enforced by design; the dashboard generator never emits contact fields |
| GitHub Actions logs | structured logs; contact emails appear in send/reply lines | Minimal — logs expire per GitHub's own retention (~90 days) |

## Retention rules

| Row status | Kept for | Why |
|---|---|---|
| `new`, `emailed`, `followed_up` | as long as active | in-flight outreach |
| `replied` | indefinitely (manual delete when a conversation ends) | active relationship the operator is handling personally |
| `cold` (incl. bounced) | **`RETENTION_DAYS` (default 365)** after `date_cold`/`bounced_at`, then eligible for purge | dead leads; a year covers "re-approach next academic year", after which keeping the PII has no purpose |
| `do_not_contact` | **forever — never purged** | it's the suppression list; deleting it could let the address be re-scraped and re-emailed, the exact thing the person asked us never to do |

## The machinery

- `npx tsx src/cli.ts retention` — report only: how many cold rows are past
  the window, per category.
- `npx tsx src/cli.ts retention --purge` — actually deletes those rows
  (`--purge --dry-run` previews). Deletions happen bottom-up in one batch so
  row indices can't shift mid-purge. `do_not_contact`/`replied` rows are
  excluded by the pure selection logic (`analytics/retention.ts`, unit-tested).
- `retention.yml` — monthly **report-only** email. Purging is deliberately
  manual: read the report, then run the workflow by hand with `purge=true`
  (or run the CLI). An automated job silently deleting CRM rows is a
  debugging nightmare and a data-loss risk; a monthly nag is not.
- Set the window with `RETENTION_DAYS` (env / repository variable).

## Operator notes

- Someone asks to be forgotten → set their row to `do_not_contact` (keeps the
  suppression) — or delete the row entirely if they explicitly want no trace
  retained; if so, also honour it by never re-adding that source page, since
  a re-scrape could re-discover the address.
- The Sheet itself is the only personal-data store; deleting a row there is
  the complete deletion (dashboards/logs hold no per-contact copies).
