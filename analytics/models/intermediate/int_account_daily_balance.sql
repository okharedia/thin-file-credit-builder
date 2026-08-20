-- End-of-day balance per account, reconstructed across the whole observed
-- range rather than per scoring window.
--
-- accounts.balance_cents is the balance *now*. Rolling it back over every
-- transaction we hold gives the balance before the first one:
--
--   opening      = balance_cents - SUM(all transactions)
--   balance(day) = opening + SUM(transactions up to and including day)
--
-- which is algebraically the same as walking backwards from today's balance,
-- but stable per day. mkListAccountDailyBalances (src/database.ts) walks
-- backwards over only the transactions inside the requested window, so it
-- treats today's balance as the balance on the window's last day and every
-- reconstructed day is off by the net of everything that happened after it.
-- That is the bug this model does not reproduce.
--
-- Assumption: balance_cents corresponds to the state after the last
-- transaction we hold. The API returns no as-of timestamp with it.

with observation as (

    select * from {{ ref('int_observation_window') }}

),

days as (

    select
        unnest(
            generate_series(observed_from, observed_to, interval 1 day)
        )::date as day
    from observation

),

opening_balances as (

    select
        accounts.account_id,
        accounts.user_id,
        accounts.account_type,
        accounts.balance_cents
            - coalesce(sum(transactions.amount_cents), 0) as opening_balance_cents
    from {{ ref('stg_accounts') }} as accounts
    left join {{ ref('stg_transactions') }} as transactions
        on transactions.account_id = accounts.account_id
    group by
        accounts.account_id,
        accounts.user_id,
        accounts.account_type,
        accounts.balance_cents

),

daily_net as (

    select
        account_id,
        transaction_date as day,
        sum(amount_cents) as net_cents
    from {{ ref('stg_transactions') }}
    group by account_id, transaction_date

),

account_days as (

    select
        opening_balances.account_id,
        opening_balances.user_id,
        opening_balances.account_type,
        opening_balances.opening_balance_cents,
        days.day,
        coalesce(daily_net.net_cents, 0) as net_cents
    from opening_balances
    cross join days
    left join daily_net
        on daily_net.account_id = opening_balances.account_id
        and daily_net.day = days.day

)

select
    account_id,
    user_id,
    account_type,
    day,
    opening_balance_cents + sum(net_cents) over (
        partition by account_id
        order by day
        rows between unbounded preceding and current row
    ) as end_of_day_balance_cents,
    opening_balance_cents + sum(net_cents) over (
        partition by account_id
        order by day
        rows between unbounded preceding and current row
    ) < 0 as is_negative_balance_day
from account_days
