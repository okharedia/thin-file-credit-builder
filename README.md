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

Listens on `http://localhost:3000`. Schema is applied only by `db:init`; the process does not create it. Defaults match the assignment API (`.env.example`). The process does not load `.env`. `npm test` runs the suite.

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

![Sync sequence](docs/diagrams/sync-sequence.svg)

![Reliability sequence](docs/diagrams/reliability-sequence.svg)


## Assumptions

Closing account balance is used to reconstruct day balances within the transaction date range. If the last transaction does not match the closing account balance, the negative balance days will be off.
> As a long time solution, we whould sync account balances everyday and keep snapshot records per day.

## Scoring limitations and bias

Rules over MCC labels. Irregular or cash income looks worse than a salaried card trail. Shared rent looks like missing essentials. Generic credits can inflate coverage. Savings is presence, not amount. `high_risk` can encode lifestyle, not default risk. Two checking accounts can double-count a negative day. Six months makes one bad month large. The 2× coverage cap treats “comfortable” and “very high surplus” the same.

Not a lending decision without a model version, input replay, and a fairness review of the MCC map.

## Discussion

Not implemented. How I would take it further:

- **API.** `/api/v1/`. Version control the api so it becomes easier to make changes to fields and calculations.
- **Ownership.** Own the MCC dictionary and use a snapshot of what is synced for the calculations so changes from Banking API doesn't dynamically change the outcome from under us.
- **Consistency.** Add a concept of `sync run` that records the result of a syncd run. It should record if its successful or fails. Each transaction syncd can be traced to a run. A run could even record its last transaction synced and be resumed.
- **Scale.** Migrate to Postgres for scalability. MCC dictionary is a small cacheable read. Observe performance of SQL queries and apply indexes where needed. Move data to datawarehouse and take advantage of warehouse speed.
- **Sync.** If Banking api supports this, webhooks could be used for incremental sync.
- **Cache** Cache reliability api result that can be replayed when rerequested or optimalisitically store result per user for quick retrieval.
- **Explainability.** Persist all variables, metrics and point values during calculation so yesterday’s score can be replayed.
- **Bias.** Measure gaps by income regularity, cash vs card, presence of essential MCCs. Review whether `high_risk` is default risk or moralizing spend.
- **Incidents.** Log Banking API status, sync duration, rows inserted and setup observations for anomalies eg. Score jumps: check dictionary drift and sync failures.

## AI usage

Cursor was used for scaffolding, boucing ideas and tests
