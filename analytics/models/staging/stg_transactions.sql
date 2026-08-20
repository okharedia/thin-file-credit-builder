-- Transactions with the per-transaction classification flags used by the
-- reliability metrics. These mirror the `flagged_transactions` CTE in
-- mkGetReliabilityMetrics (src/database.ts) one-for-one; any change to the
-- grouping rules there has to be made here too.
--
-- A transaction whose merchant_category_code is absent from the dictionary
-- belongs to no group, exactly as the `IN (SELECT code FROM ...)` checks in
-- the application query treat it. The group is coalesced to a sentinel so the
-- flags stay strictly boolean instead of going NULL.

with transactions as (

    select
        id as transaction_id,
        account_id,
        amount_cents,
        currency,
        transaction_date::date as transaction_date,
        description,
        merchant_category_code,
        merchant_name,
        type as transaction_type
    from {{ source('app', 'transactions') }}

),

joined as (

    select
        transactions.transaction_id,
        transactions.account_id,
        accounts.user_id,
        accounts.account_type,
        transactions.amount_cents,
        transactions.currency,
        transactions.transaction_date,
        date_trunc('month', transactions.transaction_date)::date as transaction_month,
        transactions.description,
        transactions.merchant_category_code,
        transactions.merchant_name,
        transactions.transaction_type,
        coalesce(categories.merchant_category_group, 'unmapped')
            as merchant_category_group
    from transactions
    inner join {{ ref('stg_accounts') }} as accounts
        on accounts.account_id = transactions.account_id
    left join {{ ref('stg_merchant_categories') }} as categories
        on categories.merchant_category_code = transactions.merchant_category_code

)

select
    *,

    -- A credit, or anything in an income category, but never savings: moving
    -- money into a savings account is not income.
    (transaction_type = 'credit' or merchant_category_group = 'income')
        and merchant_category_group <> 'savings' as is_income,

    transaction_type = 'debit'
        and merchant_category_group <> 'savings' as is_spending_debit,

    merchant_category_group = 'essential' as is_essential_expense,
    merchant_category_group = 'savings' as is_savings,
    merchant_category_group = 'fees' as is_late_fee,
    merchant_category_group = 'high_risk' as is_high_risk

from joined
