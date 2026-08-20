-- The window bounds must match getScoringWindow (src/utils/scoring-window.ts):
-- the N calendar months ending on `from`, inclusive.

{% set window_offset_months = var('scoring_window_month_count') - 1 %}

select
    user_id,
    as_of_date,
    window_start_date,
    window_end_date
from {{ ref('fct_user_daily_metrics') }}
where
    window_start_date
        <> date_trunc('month', as_of_date - to_months({{ window_offset_months }}))::date
    or window_end_date <> as_of_date
