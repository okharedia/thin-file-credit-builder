# Thin-File Credit Builder

Syncs the Banking API into SQLite and scores a Reliability Index (0–100)

## Tech stack

- **Runtime:** Node.js 22+
- **Language:** TypeScript
- **HTTP:** Fastify
- **DB:** SQLite via `better-sqlite3`
- **Analytics:** DuckDB + dbt (`analytics/`), read-only over the SQLite file

## Setup

```bash
npm install
npm run db:init
npm run dev
```

The reliability endpoint reads precomputed metrics from a dbt-built DuckDB
mart, so it needs that mart to exist. One-time toolchain setup:

```bash
npm run analytics:setup
```

Then, after every sync, rebuild the mart:

```bash
npm run analytics:build
```

`npm run sync:all` syncs every user the Banking API lists. See
[analytics/README.md](analytics/README.md) for the model layout and the two
design decisions worth knowing about.

Listens on `http://localhost:3000`. Schema is applied only by `db:init`; the process does not create it. No `.env` file needed — the defaults (listed in `.env.example`) are hardcoded and already match the assignment API. To override any of them, set real environment variables; `.env` itself is never loaded. `npm test` runs the suite.

## Docker

```bash
docker compose up --build
```

Wait until the `app` service is healthy, then in another terminal:

```bash
curl -X POST http://localhost:3000/api/users/user_1001/sync
```

Syncing changes the underlying data, so rebuild the mart before scoring:

```bash
docker compose exec app npm run analytics:build
```

```bash
curl "http://localhost:3000/api/users/user_1001/reliability?from=2026-02-20"
```

The image applies the SQLite schema on start and builds the mart, which is
empty until something is synced — the reliability endpoint answers 404 until
then. `/health` is liveness only and does not touch either database, so the
container is healthy before any sync. SQLite and DuckDB are both kept in a
named volume (`credit-builder-data`), so a later `docker compose up` reuses
synced data.

Without Compose:

```bash
docker build -t thin-file-credit-builder .
docker run --rm -p 3000:3000 thin-file-credit-builder
```

## Endpoints

- Health
- Sync User
- User Reliability Index

Example user: `user_1001`. For other user IDs: `curl` the Banking API `/`.

```bash
curl -X POST http://localhost:3000/api/users/user_1001/sync
curl "http://localhost:3000/api/users/user_1001/reliability?from=2026-02-20"
```

`from` is required (`YYYY-MM-DD`). Window is the 6 calendar months ending on that date, inclusive.

A score is only returned when that entire window is covered by synced data.
Dates whose window reaches back before the data return **404** with the range
that can be answered, rather than a score computed from months we never
observed:

```json
{
  "error": "No reliability score is available for that date. Its 6-month scoring window is not fully covered by synced banking data.",
  "scoreable_from": "2026-02-01",
  "scoreable_to": "2027-06-28"
}
```

An unsynced user also returns 404. Both were previously answered with a
zero-filled score, which reported `LOW` for people we simply had no data on.

## Diagrams

Sources: `docs/diagrams/*.mmd`. Regenerate: `npm run docs:diagrams`.

![Architecture](docs/diagrams/architecture.svg)

![Reliability sequence](docs/diagrams/reliability-sequence.svg)

## Assumptions

- **`negative_balance_days` is not trustworthy on the current mock data.** It is reconstructed by rolling `balance_cents` back over the transaction history, which is coherent — one balance per account-day — but the mock Banking API generates balances independently of transactions: 10 of 15 accounts imply a negative opening balance, and `acc_1009_chk` reports a €5,800 balance against €81,876 of net credits. The previous implementation truncated the reconstruction at the window edge, which masked this and returned different balances for the same day depending on which window you asked about. Fixing that made the defect visible rather than accurate. A real fix needs a balance-as-of date or daily snapshots from the Banking API. Details in [analytics/README.md](analytics/README.md).
- `good_months` is not defined in the scoring model. We count months with a `savings` transaction, same number as the savings points.
- The MCC dictionary is one shared local copy, overwritten on every `/sync` (any user). Scoring reads that copy, not the live API. If the API changes a group, the next sync changes later scores for everyone. Replaying a score needs dictionary versions (see Discussion).

## Scoring limitations and bias

The score only sees card transactions and MCC groups over 6 months. It does not know if someone can pay their bills.

- Points come from MCC groups (`income`, `essential`, `savings`, `fees`, `high_risk`). If a code is in the wrong group, the score follows that.
- Income regularity is "did this month have any income or credit?" Cash pay and gappy freelance look worse than a monthly salary, even when they earn more.
- Essential consistency wants each essential MCC to show up. If a partner pays rent from their account, this user looks like they skip rent.
- Any `credit` except savings counts as income, including refunds and transfers in. That can inflate coverage (income / essential spend).
- Savings points count months with a positive savings txn, not the amount. €1 and €10,000 in the same month score the same.
- `high_risk` is usually gambling, bars, and similar. You can pay every bill and still lose points for what you bought.
- Negative days are summed per checking account. Two accounts below zero on the same day count as two days (capped at −10).
- The window is 6 months, so one bad month is a large share of the score.
- Coverage is full at 2× income/essentials. 2× and 10× both get 25 points.

Don't use this for lending unless the model version is frozen, yesterday's inputs can be replayed, and someone has reviewed whether the MCC map is fair (especially `high_risk`).

## Discussion

Not implemented. If I took this further:

- **API.** `/api/v1/`. Add fields. If a field's meaning changes, give it a new name or bump the version.
- **Ownership.** Banking API owns transactions and MCC groups. We own the local dictionary copy, derived facts, and the score. I'd version the dictionary and store which version each score used.
- **Consistency.** A `sync_run` per sync (ok/fail, last txn) so we can trace and resume.
- **Scale.** Postgres for scalability. Index the slow queries. Warehouse for historical aggregates. The dictionary is small enough to cache.
- **Sync.** `/sync` always pulls full history. I'd store a last-synced cursor per account. Webhooks if the Banking API has them; otherwise a daily sync job.
- **Cache.** Cache the reliability response by user, `from`, and current sync/dictionary state. Drop it on `/sync`.
- **Explainability.** Persist the metrics and point breakdown so yesterday's score can be replayed.
- **Bias.** Look at cash vs card, irregular income, and missing essential MCCs. Check whether `high_risk` is default risk or lifestyle.
- **Incidents.** Log Banking API status, sync duration, rows inserted. If scores jump, check dictionary drift and a failed sync first.

## AI usage

Cursor was used for scaffolding, pairing and tests