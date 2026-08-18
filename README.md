# Thin-File Credit Builder

Syncs the Banking API into SQLite and scores a Reliability Index (0–100)

## Tech stack

- **Runtime:** Node.js 22+
- **Language:** TypeScript
- **HTTP:** Fastify
- **DB:** SQLite via `better-sqlite3`

## Setup

```bash
npm install
npm run db:init
npm run dev
```

Listens on `http://localhost:3000`. Schema is applied only by `db:init`; the process does not create it. No `.env` file needed — the defaults (listed in `.env.example`) are hardcoded and already match the assignment API. To override any of them, set real environment variables; `.env` itself is never loaded. `npm test` runs the suite.

## Docker

```bash
docker compose up --build
```

Wait until the `app` service is healthy, then in another terminal:

```bash
curl -X POST http://localhost:3000/api/users/user_1001/sync
curl "http://localhost:3000/api/users/user_1001/reliability?from=2026-02-20"
```

The image applies the SQLite schema on start. SQLite is kept in a named volume (`credit-builder-data`), so a later `docker compose up` reuses synced data.

Without Compose:

```bash
docker build -t thin-file-credit-builder .
docker run --rm -p 3000:3000 thin-file-credit-builder
```

## Endpoints

- Sync User
- User Reliability Index

Example user: `user_1001`. For other user IDs: `curl` the Banking API `/`.

```bash
curl -X POST http://localhost:3000/api/users/user_1001/sync
curl "http://localhost:3000/api/users/user_1001/reliability?from=2026-02-20"
```

`from` is required (`YYYY-MM-DD`). Window is the 6 calendar months ending on that date, inclusive.

## Diagrams

Sources: `docs/diagrams/*.mmd`. Regenerate: `npm run docs:diagrams`.

![Architecture](docs/diagrams/architecture.svg)

![Reliability sequence](docs/diagrams/reliability-sequence.svg)

## Assumptions

- Negative-balance days are walked backwards from the account's current `balance_cents`, not from `from`. Fine when `from` is today. For an older `from`, later transactions shift every reconstructed day, so the count can be wrong. To fix it we'd need a balance-as-of-date from the Banking API, or daily snapshots on each sync.
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