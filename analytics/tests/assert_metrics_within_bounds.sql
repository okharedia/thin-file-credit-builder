-- Structural bounds the scoring formulas assume. Violations here would let
-- calculateReliabilityScore produce points outside its documented range.

select *
from {{ ref('fct_user_daily_metrics') }}
where
    income_month_count not between 0 and {{ var('scoring_window_month_count') }}
    or savings_month_count not between 0 and {{ var('scoring_window_month_count') }}
    or essential_category_month_count not between
        0 and {{ var('scoring_window_month_count') }} * essential_category_count
    or late_fee_event_count < 0
    or negative_balance_day_count < 0
    or total_essential_expenses_cents < 0
    or total_spending_debit_cents < 0
    or total_high_risk_debit_cents < 0
    -- High-risk spending is a subset of all spending.
    or total_high_risk_debit_cents > total_spending_debit_cents
    -- The window cannot contain more negative account-days than it has days,
    -- times the number of checking accounts the user holds.
    or negative_balance_day_count > (
        (window_end_date - window_start_date + 1)
        * (
            select count(*)
            from {{ ref('stg_accounts') }} as accounts
            where accounts.user_id = fct_user_daily_metrics.user_id
                and accounts.account_type = 'checking'
        )
    )
