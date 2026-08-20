-- No row may rely on a window that extends past the data we actually hold.
-- A partially-observed window would produce a low score indistinguishable
-- from a genuinely low one, so those dates are excluded from the spine
-- entirely rather than zero-filled.

select
    metrics.user_id,
    metrics.as_of_date,
    metrics.window_start_date,
    observation.observed_from,
    observation.observed_to
from {{ ref('fct_user_daily_metrics') }} as metrics
cross join {{ ref('int_observation_window') }} as observation
where metrics.window_start_date < observation.observed_from
    or metrics.window_end_date > observation.observed_to
