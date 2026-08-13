-- Walk/meal tooltips show the day's own averages: time between events
-- (within-day gaps, same rule as stats_summary) and average walk
-- duration. Appended to stats_daily_counts (create-or-replace may only
-- add columns at the end).

create or replace view stats_daily_counts
with (security_invoker = true) as
with events_gapped as (
	select
		dog_id,
		type_id,
		details,
		(occurred_at at time zone 'Europe/Stockholm')::date as day,
		(lag(occurred_at) over w at time zone 'Europe/Stockholm')::date as prev_day,
		extract(epoch from occurred_at - lag(occurred_at) over w) / 60.0 as gap_min
	from events
	window w as (partition by dog_id, type_id order by occurred_at)
)
select
	dog_id,
	type_id,
	day,
	count(*) as n,
	sum((details ->> 'duration_min')::numeric)
		filter (where details ? 'duration_min') as duration_min,
	sum(
		case jsonb_typeof(details -> 'pee')
			when 'number' then (details ->> 'pee')::int
			when 'boolean' then case when (details ->> 'pee')::boolean then 1 else 0 end
			else 0
		end
	) as pee,
	sum(
		case jsonb_typeof(details -> 'poop')
			when 'number' then (details ->> 'poop')::int
			when 'boolean' then case when (details ->> 'poop')::boolean then 1 else 0 end
			else 0
		end
	) as poop,
	count(*) filter (where (details ->> 'finished')::boolean) as finished_true,
	count(*) filter (where not (details ->> 'finished')::boolean) as finished_false,
	avg(gap_min) filter (where prev_day = day) as avg_gap_min,
	avg((details ->> 'duration_min')::numeric)
		filter (where details ? 'duration_min') as avg_duration_min
from events_gapped
group by dog_id, type_id, day;
