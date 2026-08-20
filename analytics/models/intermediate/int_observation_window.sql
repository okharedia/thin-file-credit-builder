-- The window of time we actually have banking data for.
--
-- The application never persists the Banking API's `data_range` (sync.ts
-- fetches it, pages transactions with it, and drops it), so it is inferred
-- from the transactions we hold. The inference is conservative: if nobody
-- transacted on the first day of the real range, this window starts later
-- than the true one, which shrinks the set of scoreable dates rather than
-- inventing coverage we do not have.

select
    min(transaction_date) as observed_from,
    max(transaction_date) as observed_to
from {{ ref('stg_transactions') }}
