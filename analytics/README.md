# Analytics (dbt + DuckDB)

Precomputes the reliability metrics for every `(user_id, as_of_date)` pair, so
scoring a user becomes a single-row lookup instead of two aggregate queries.

DuckDB attaches the application's SQLite file **read-only**. There is no ETL
and no second write path: `POST /api/users/:userId/sync` remains the only thing
that writes application data.

## Running it

```bash
npm run analytics:setup
```

```bash
npm run analytics:build
```

```bash
npm run analytics:parity
```

`analytics:build` reads `data/thin-file-credit-builder.sqlite` and writes
`data/analytics.duckdb`. Both paths honour `DATABASE_PATH` and
`ANALYTICS_DUCKDB_PATH`. Run it from the repository root — the paths in
`profiles.yml` are relative to the working directory.

The mart is only as fresh as the last build; every row carries `built_at`.
`/sync` does not trigger a rebuild.

> **DuckDB takes a file lock.** A single read-write connection excludes
> everything else, including the API's read-only one. If a GUI client (DBeaver,
> a notebook) has `analytics.duckdb` open read-write, the API fails to open it
> and the endpoint returns 500. Open it read-only in those tools, or point the
> API at a copy via `ANALYTICS_DUCKDB_PATH`. `analytics:build` needs write
> access, so it will also fail while something else holds the file.

> A globally installed `dbt` may be dbt-fusion, a different implementation.
> The `analytics:*` scripts always call `./.venv/bin/dbt`, pinned in
> `requirements.txt` to dbt-core 1.12.2 + dbt-duckdb 1.11.0.

## Lineage

```
sqlite (attached read-only)
  accounts / transactions / merchant_categories
        │
  stg_accounts   stg_transactions   stg_merchant_categories
        │              │
        │        int_observation_window ──── dim_as_of_date
        │              │                          │
        │        int_transaction_daily            │
  int_account_daily_balance                       │
        └──────────────┴──────────────────────────┘
                       │
             fct_user_daily_metrics
```

Everything is materialized as a table. Views would reference the attached `app`
catalog, which makes `analytics.duckdb` unreadable unless the SQLite file is
attached again at query time.

## Two decisions worth knowing about

### Dates with a partial window are absent, not zero-filled

The scoring window is the 6 calendar months ending on `as_of_date`
(`date_trunc('month', as_of_date - 5 months) .. as_of_date`), matching
`getScoringWindow`. A row only exists when that entire window falls inside the
observed data range.

This matters more than it sounds. Data currently starts `2025-09-01`, so for
`as_of_date = 2025-10-15` four of the six months are unobserved. Zero-filling
them would report `income_month_count = 2`, worth 8 of 25 points instead of 25
— a real-looking bad score for someone whose only problem is that collection
started in September. Those dates are therefore omitted, and the API should
return 404 rather than a fabricated score.

With the current dataset the scoreable range is **2026-02-01 → 2027-06-28**
(513 dates × 10 users = 5,130 rows). The README's example `from=2026-02-20` is
inside it.

The observed range is inferred from `min/max(transaction_date)`, because the
Banking API's `data_range` is never persisted — `sync.ts` fetches it, pages
transactions with it, and drops it. The inference is conservative: if nobody
transacted on the real first day, the range starts later, which shrinks the
scoreable set rather than inventing coverage.

### `negative_balance_day_count` does not reproduce the application's answer

**This metric is not trustworthy on the current mock data, in either
implementation.**

`mkListAccountDailyBalances` walks backwards from `accounts.balance_cents` but
only over transactions *inside the requested window*, so it treats today's
balance as the balance on the window's last day. The same calendar day
therefore gets different balances depending on which window you ask about.
For `acc_1001_chk` on 2026-06-01:

| asked via | reconstructed balance |
| --- | --- |
| `from=2026-07-01` | **+€1,155.11** |
| `from=2026-11-30` | **−€4,192.72** |

This model instead anchors once and rolls forward across the whole history:

```
opening      = balance_cents − SUM(all transactions)
balance(day) = opening + SUM(transactions up to and including day)
```

which yields one balance per account-day. That is the correct reconstruction
*given the inputs* — but the inputs do not reconcile. The mock Banking API
generates `balance` independently of the transaction stream: 10 of 15 accounts
imply a negative opening balance, and `acc_1009_chk` reports a €5,800 balance
against €81,876 of net credits.

So this model is coherent where the application is not, but neither is
accurate. Getting this right needs a balance-as-of date or daily balance
snapshots from the Banking API, as the root README's assumptions already note.

`npm run analytics:parity` reports the divergence. On a 197-window sample the
raw count differs on 155, of which 20 change resilience points, with a largest
swing of 10 points — enough to move a score band. The other nine metrics match
the application exactly.

## Tests

`npm run analytics:build` runs 20 data tests: uniqueness on
`(user_id, as_of_date)`, not-null on every column, and four singular tests —

- `assert_window_matches_scoring_window` — bounds equal `getScoringWindow`
- `assert_every_window_fully_observed` — no row relies on unobserved data
- `assert_metrics_within_bounds` — counts inside the ranges scoring assumes
- `assert_no_unmapped_merchant_categories` — canary for dictionary drift, since
  the dictionary is one shared copy overwritten by every `/sync`

`npm run analytics:parity` is the harness that holds the mart to the
application's own queries.
