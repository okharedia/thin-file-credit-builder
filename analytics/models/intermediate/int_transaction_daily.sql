-- Transaction measures rolled up to (user, day, merchant category).
--
-- The merchant category and month are kept in the grain because two of the
-- metrics are distinct counts over them -- months with income, and distinct
-- (category, month) pairs for essential spending -- and those cannot be
-- recovered from a coarser rollup.

select
    user_id,
    transaction_date,
    transaction_month,
    merchant_category_code,

    coalesce(sum(amount_cents) filter (where is_income), 0)
        as income_cents,
    coalesce(sum(-amount_cents) filter (where is_essential_expense), 0)
        as essential_expense_cents,
    coalesce(sum(-amount_cents) filter (where is_spending_debit), 0)
        as spending_debit_cents,
    coalesce(sum(-amount_cents) filter (where is_spending_debit and is_high_risk), 0)
        as high_risk_debit_cents,

    count(*) filter (where is_late_fee) as late_fee_event_count,

    coalesce(bool_or(is_income), false) as has_income,
    coalesce(bool_or(is_essential_expense), false) as has_essential_expense,
    -- Only a positive savings movement counts as savings activity.
    coalesce(bool_or(is_savings and amount_cents > 0), false) as has_savings_deposit

from {{ ref('stg_transactions') }}
group by
    user_id,
    transaction_date,
    transaction_month,
    merchant_category_code
