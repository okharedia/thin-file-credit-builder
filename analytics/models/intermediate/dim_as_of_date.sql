-- Every date a reliability score can honestly be produced for.
--
-- The scoring window is the N calendar months ending on `as_of_date`, matching
-- getScoringWindow (src/utils/scoring-window.ts):
--
--   from=2026-02-20, N=6  ->  2025-09-01 .. 2026-02-20
--
-- A date is only included when its *entire* window falls inside the observed
-- data range. Dates with a partially-observed window are deliberately absent
-- rather than emitted with zero-filled metrics: a window we only half-observed
-- produces a low score that looks indistinguishable from a genuinely low one.

{% set window_offset_months = var('scoring_window_month_count') - 1 %}

with observation as (

    select * from {{ ref('int_observation_window') }}

),

candidate_dates as (

    select
        unnest(
            generate_series(observed_from, observed_to, interval 1 day)
        )::date as as_of_date
    from observation

)

select
    candidate_dates.as_of_date,
    date_trunc(
        'month', candidate_dates.as_of_date - to_months({{ window_offset_months }})
    )::date as window_start_date,
    candidate_dates.as_of_date as window_end_date
from candidate_dates
cross join observation
where date_trunc(
    'month', candidate_dates.as_of_date - to_months({{ window_offset_months }})
)::date >= observation.observed_from
