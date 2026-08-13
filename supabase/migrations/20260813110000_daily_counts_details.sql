-- The walks-per-day tooltip shows kiss/bajs for the day, and the meal
-- chart splits finished/not finished — append those sums to
-- stats_daily_counts (create-or-replace may only add columns at the
-- end). Detail values may be numbers (counts) or legacy booleans.

create or replace view stats_daily_counts
with (security_invoker = true) as
select
	dog_id,
	type_id,
	(occurred_at at time zone 'Europe/Stockholm')::date as day,
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
	count(*) filter (where not (details ->> 'finished')::boolean) as finished_false
from events
group by dog_id, type_id, day;
