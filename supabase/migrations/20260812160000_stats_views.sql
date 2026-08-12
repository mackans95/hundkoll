-- Phase 4: statistics. All aggregation lives in SQL; pages only format.
-- Day bucketing uses Europe/Stockholm so a 00:30 walk lands on the right day.

-- One row per dog with every headline number. Averages use a 30-day window;
-- the per-week/per-month accident averages use proportionally longer ones.
create view stats_summary
with (security_invoker = true) as
with gaps as (
	select
		dog_id,
		type_id,
		occurred_at,
		extract(
			epoch from occurred_at - lag(occurred_at)
				over (partition by dog_id, type_id order by occurred_at)
		) / 60.0 as gap_min
	from events
	where type_id in ('walk', 'meal')
)
select
	d.id as dog_id,
	(
		select count(*) / 30.0 from events e
		where e.dog_id = d.id and e.type_id = 'walk'
			and e.occurred_at > now() - interval '30 days'
	) as walks_per_day,
	(
		select avg(g.gap_min) from gaps g
		where g.dog_id = d.id and g.type_id = 'walk'
			and g.occurred_at > now() - interval '30 days'
	) as avg_walk_gap_min,
	(
		select avg((e.details ->> 'duration_min')::numeric) from events e
		where e.dog_id = d.id and e.type_id = 'walk'
			and e.occurred_at > now() - interval '30 days'
			and e.details ? 'duration_min'
	) as avg_walk_duration_min,
	(
		select avg(g.gap_min) from gaps g
		where g.dog_id = d.id and g.type_id = 'meal'
			and g.occurred_at > now() - interval '30 days'
	) as avg_meal_gap_min,
	(
		select avg(case when (e.details ->> 'finished')::boolean then 1.0 else 0.0 end)
		from events e
		where e.dog_id = d.id and e.type_id = 'meal'
			and e.occurred_at > now() - interval '30 days'
			and e.details ? 'finished'
	) as meal_finish_rate,
	(
		select count(*) / 30.0 from events e
		where e.dog_id = d.id and e.type_id = 'accident'
			and e.occurred_at > now() - interval '30 days'
	) as accidents_per_day,
	(
		select count(*) / 12.0 from events e
		where e.dog_id = d.id and e.type_id = 'accident'
			and e.occurred_at > now() - interval '84 days'
	) as accidents_per_week,
	(
		select count(*) / 6.0 from events e
		where e.dog_id = d.id and e.type_id = 'accident'
			and e.occurred_at > now() - interval '180 days'
	) as accidents_per_month
from dogs d;

-- Per dog/type/Stockholm-day counts; powers the walks-per-day chart.
create view stats_daily_counts
with (security_invoker = true) as
select
	dog_id,
	type_id,
	(occurred_at at time zone 'Europe/Stockholm')::date as day,
	count(*) as n,
	sum((details ->> 'duration_min')::numeric)
		filter (where details ? 'duration_min') as duration_min
from events
group by dog_id, type_id, day;

-- Accidents pre-binned per day, week and month, split by kiss/bajs counts.
-- Details values may be numbers (counts) or legacy booleans.
create view stats_accident_bins
with (security_invoker = true) as
select
	e.dog_id,
	p.period,
	date_trunc(p.period, e.occurred_at at time zone 'Europe/Stockholm')::date as bucket,
	count(*) as n,
	sum(
		case jsonb_typeof(e.details -> 'pee')
			when 'number' then (e.details ->> 'pee')::int
			when 'boolean' then case when (e.details ->> 'pee')::boolean then 1 else 0 end
			else 0
		end
	) as pee,
	sum(
		case jsonb_typeof(e.details -> 'poop')
			when 'number' then (e.details ->> 'poop')::int
			when 'boolean' then case when (e.details ->> 'poop')::boolean then 1 else 0 end
			else 0
		end
	) as poop
from events e
cross join (values ('day'), ('week'), ('month')) as p (period)
where e.type_id = 'accident'
group by e.dog_id, p.period, bucket;
