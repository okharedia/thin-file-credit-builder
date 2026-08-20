-- Reliability metrics for the trailing N-calendar-month window, for every
-- (user, as_of_date) whose window is fully covered by observed data.
--
-- One row here replaces both mkGetReliabilityMetrics and
-- mkGetCheckingAccountNegativeBalanceDayCount (src/database.ts). Scoring
-- itself stays in TypeScript: this model emits the inputs to
-- calculateReliabilityScore, never the score or the band.
--
-- The window bound is date_trunc('month', as_of_date - 5 months), not a
-- rolling six months to the day, so a RANGE window frame would be the wrong
-- shape. It is a range join instead, which also allows the COUNT(DISTINCT)
-- metrics that a window frame cannot express.

with as_of_dates as (

    select * from {{ ref('dim_as_of_date') }}

),

users as (

    select distinct user_id from {{ ref('stg_accounts') }}

),

user_as_of_dates as (

    select
        users.user_id,
        as_of_dates.as_of_date,
        as_of_dates.window_start_date,
        as_of_dates.window_end_date
    from users
    cross join as_of_dates

),

-- The denominator of essential payments consistency is the number of
-- essential codes in the dictionary, not the number this user touched.
essential_category_count as (

    select count(distinct merchant_category_code) as essential_category_count
    from {{ ref('stg_merchant_categories') }}
    where merchant_category_group = 'essential'

),

transaction_metrics as (

    select
        user_as_of_dates.user_id,
        user_as_of_dates.as_of_date,

        count(distinct daily.transaction_month)
            filter (where daily.has_income) as income_month_count,
        coalesce(sum(daily.income_cents), 0) as total_income_cents,
        coalesce(sum(daily.essential_expense_cents), 0)
            as total_essential_expenses_cents,
        count(distinct
            daily.merchant_category_code || ':' || daily.transaction_month
        ) filter (where daily.has_essential_expense)
            as essential_category_month_count,
        count(distinct daily.transaction_month)
            filter (where daily.has_savings_deposit) as savings_month_count,
        coalesce(sum(daily.late_fee_event_count), 0) as late_fee_event_count,
        coalesce(sum(daily.spending_debit_cents), 0) as total_spending_debit_cents,
        coalesce(sum(daily.high_risk_debit_cents), 0) as total_high_risk_debit_cents

    from user_as_of_dates
    left join {{ ref('int_transaction_daily') }} as daily
        on daily.user_id = user_as_of_dates.user_id
        and daily.transaction_date
            between user_as_of_dates.window_start_date
            and user_as_of_dates.window_end_date
    group by user_as_of_dates.user_id, user_as_of_dates.as_of_date

),

-- Counted per account-day: two checking accounts below zero on the same day
-- count twice, matching mkListCheckingAccountNegativeBalanceDayCounts.
negative_balance_days as (

    select
        user_as_of_dates.user_id,
        user_as_of_dates.as_of_date,
        count(*) filter (where balances.is_negative_balance_day)
            as negative_balance_day_count
    from user_as_of_dates
    left join {{ ref('int_account_daily_balance') }} as balances
        on balances.user_id = user_as_of_dates.user_id
        and balances.account_type = 'checking'
        and balances.day
            between user_as_of_dates.window_start_date
            and user_as_of_dates.window_end_date
    group by user_as_of_dates.user_id, user_as_of_dates.as_of_date

)

select
    user_as_of_dates.user_id,
    user_as_of_dates.as_of_date,
    user_as_of_dates.window_start_date,
    user_as_of_dates.window_end_date,

    transaction_metrics.income_month_count,
    transaction_metrics.total_income_cents,
    transaction_metrics.total_essential_expenses_cents,
    transaction_metrics.essential_category_month_count,
    essential_category_count.essential_category_count,
    transaction_metrics.savings_month_count,
    transaction_metrics.late_fee_event_count,
    transaction_metrics.total_spending_debit_cents,
    transaction_metrics.total_high_risk_debit_cents,
    negative_balance_days.negative_balance_day_count,

    {{ dbt.current_timestamp() }} as built_at

from user_as_of_dates
inner join transaction_metrics
    on transaction_metrics.user_id = user_as_of_dates.user_id
    and transaction_metrics.as_of_date = user_as_of_dates.as_of_date
inner join negative_balance_days
    on negative_balance_days.user_id = user_as_of_dates.user_id
    and negative_balance_days.as_of_date = user_as_of_dates.as_of_date
cross join essential_category_count
