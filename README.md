# Thin-File Credit Builder

Syncs the Banking API into SQLite and scores a Reliability Index (0–100). TypeScript, Fastify, `better-sqlite3`. No ML. Node.js 22+.

## Setup

```bash
npm install
npm run db:init
npm run dev
```

Listens on `http://localhost:3000`. Schema is applied only by `db:init`; the process does not create it. Defaults match the assignment API (`.env.example`). The process does not load `.env`. `npm test` runs the suite.

## Endpoints

```bash
curl -X POST http://localhost:3000/api/users/user_1001/sync
curl "http://localhost:3000/api/users/user_1001/reliability?from=2026-02-20"
```

`from` is required (`YYYY-MM-DD`). Window is the 6 calendar months ending on that date, inclusive. Bands: LOW 0–49, MEDIUM 50–74, HIGH 75–100. Other user IDs: `curl` the Banking API `/`.

## Diagrams

Sources: `docs/diagrams/*.mmd`. Regenerate: `npm run docs:diagrams`.

![Architecture](docs/diagrams/architecture.svg)

![Sync sequence](docs/diagrams/sync-sequence.svg)

![Reliability sequence](docs/diagrams/reliability-sequence.svg)

## Scoring

`clamp(A + B + C + D, 0, 100)`. Amounts in cents. MCC groups (`income`, `essential`, `savings`, `fees`, `high_risk`) come from the Banking API dictionary at score time.

- **A (0–25):** `round((months with income / 6) × 25)`. Income = credit or `income` category, excluding `savings`.
- **B (0–25):** `round(clamp((income / essential spend) / 2, 0, 1) × 25)`. 2× coverage is a full 25. Missing income or essentials → 0.
- **C (0–25):** `round((essential category-months / (6 × essential category count)) × 25)`. Denominator is every essential MCC in the dictionary. Empty dictionary → 0.
- **D (−20 to +25):** savings `round((positive savings months / 6) × 25)`; negative balance `−min(checking account-days below 0, 10)`; late fees `−min(fee txn count, 5)`; high-risk `−round((high-risk debit / spending debit) × 5)`.

Negative days are reconstructed per checking account from the stored closing balance (account-days, not unique calendar days). Drivers always mention income months, coverage, and savings months; the rest append when they fire.

## Assumptions

- One process, one SQLite file, EUR only.
- Sync is on-demand and full-range. Duplicates are transaction id only (`INSERT OR IGNORE`).
- Accounts fetch in parallel. A mid-pagination failure can leave earlier accounts committed.
- Merchant categories are not stored. A dictionary change can move a score without a new sync.
- Closing `balance_cents` is the last upsert. If it does not match the last in-window txn, negative days drift.
- A never-synced user scores as empty history (usually LOW / 0).

## Scoring limitations and bias

Rules over MCC labels. Irregular or cash income looks worse than a salaried card trail. Shared rent looks like missing essentials. Generic credits can inflate coverage. Savings is presence, not amount. `high_risk` can encode lifestyle, not default risk. Two checking accounts can double-count a negative day. Six months makes one bad month large. The 2× coverage cap treats “comfortable” and “very high surplus” the same.

Not a lending decision without a model version, input replay, and a fairness review of the MCC map.

## Discussion

Not implemented. How I would take it further:

- **API.** `/api/v1/`. Stable field names; add keys, do not rename. Ship `model_version` next to the index. Meaning changes get a new field (`income_coverage_ratio_v2`).
- **Ownership.** Banking API owns raw txns and the MCC dictionary. This service owns the snapshot, derived facts, and the score. Persist the dictionary version used for a score.
- **Consistency.** Today: `INSERT OR IGNORE` on txn id. Add `sync_runs` and fail the run unless every account finishes. Drift: local count and max(date) vs Banking API. Out-of-order txns are fine for scoring, not for balance reconstruction if closing balance is stale.
- **Scale.** Request-path txn scan is the first wall. Worker + monthly aggregates; SQLite until write contention, then Postgres. MCC dictionary is a small cacheable read.
- **Sync.** Store `synced_through` per account. Webhooks enqueue incremental sync. Keep a scheduled catch-up.
- **Cache.** Short TTL on the MCC dictionary. Cache `(user_id, from, tx_watermark, dictionary_version) → score`. SQLite is already the txn cache.
- **Explainability.** Persist model version, metric vector, and point breakdown so yesterday’s score can be replayed.
- **Bias.** Measure gaps by income regularity, cash vs card, presence of essential MCCs. Review whether `high_risk` is default risk or moralizing spend.
- **Incidents.** Log Banking API status, sync duration, rows inserted, and the four point components. Score jumps: check dictionary drift and partial sync first.

## AI usage

Cursor was used for scaffolding, pairing and tests
