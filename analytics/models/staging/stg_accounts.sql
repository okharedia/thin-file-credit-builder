select
    id as account_id,
    user_id,
    type as account_type,
    currency,
    balance_cents,
    name as account_name
from {{ source('app', 'accounts') }}
