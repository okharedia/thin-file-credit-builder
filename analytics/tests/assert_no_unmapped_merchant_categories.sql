-- Every transaction's merchant_category_code should resolve in the dictionary.
-- An unmapped code silently scores as belonging to no group: it earns no
-- essential-consistency credit, counts as neither income nor high risk, and
-- nothing in the response says so. This fails loudly instead.
--
-- The dictionary is one shared local copy overwritten by every /sync, so this
-- is also the canary for the dictionary drift called out in the README.

select
    merchant_category_code,
    count(*) as transaction_count
from {{ ref('stg_transactions') }}
where merchant_category_group = 'unmapped'
group by merchant_category_code
