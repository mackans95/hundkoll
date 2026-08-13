-- Per-period metric buckets for the Trender card: one row per dog ×
-- period (day/week/month) × Stockholm bucket, so the page can compare
-- the last two complete periods. Gap averages pool the within-day gaps
-- of the bucket (never across midnight, same rule as everywhere else).

create view stats_period_summary
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
	e.dog_id,
	p.period,
	date_trunc(p.period, e.day)::date as bucket,
	count(*) filter (where e.type_id = 'walk') as walks,
	avg(e.gap_min) filter (where e.type_id = 'walk' and e.prev_day = e.day) as walk_gap_min,
	avg((e.details ->> 'duration_min')::numeric)
		filter (where e.type_id = 'walk' and e.details ? 'duration_min') as walk_duration_min,
	avg(e.gap_min) filter (where e.type_id = 'meal' and e.prev_day = e.day) as meal_gap_min,
	avg(case when (e.details ->> 'finished')::boolean then 1.0 else 0.0 end)
		filter (where e.type_id = 'meal' and e.details ? 'finished') as meal_finish_rate,
	count(*) filter (where e.type_id = 'accident') as accidents
from events_gapped e
cross join (values ('day'), ('week'), ('month')) as p (period)
group by e.dog_id, p.period, bucket;
