select
    code as merchant_category_code,
    name as merchant_category_name,
    "group" as merchant_category_group
from {{ source('app', 'merchant_categories') }}
