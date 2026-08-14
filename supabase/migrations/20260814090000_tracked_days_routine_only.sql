-- A weight entry backdated to July stretched days_tracked to the 30-day
-- cap, so all averages divided by 30 after three real days of tracking.
-- Tracking start now only considers routine events, which are logged in
-- real time and define the actual daily-logging window.

create or replace view stats_summary
with (security_invoker = true) as
with day_gaps as (
	select
		dog_id,
		type_id,
		(occurred_at at time zone 'Europe/Stockholm')::date as day,
		(lag(occurred_at) over w at time zone 'Europe/Stockholm')::date as prev_day,
		extract(epoch from occurred_at - lag(occurred_at) over w) / 60.0 as gap_min
	from events
	where type_id in ('walk', 'meal')
	window w as (partition by dog_id, type_id order by occurred_at)
),
daily_gap_avg as (
	select dog_id, type_id, day, avg(gap_min) as day_avg_min
	from day_gaps
	where prev_day = day
	group by dog_id, type_id, day
),
tracked as (
	-- Tracking starts at the first ROUTINE event (walk/meal/accident):
	-- those are logged in real time, whereas care/health events get
	-- backdated (an old vet visit, a historical weight) and must not
	-- stretch the averaging window.
	select
		dog_id,
		(
			(now() at time zone 'Europe/Stockholm')::date
			- min((occurred_at at time zone 'Europe/Stockholm'))::date
		) + 1 as days_tracked
	from events
	where type_id in ('walk', 'meal', 'accident')
	group by dog_id
)
select
	d.id as dog_id,
	(
		select count(*)::numeric from events e
		where e.dog_id = d.id and e.type_id = 'walk'
			and e.occurred_at > now() - interval '30 days'
	) / greatest(1, least(30, coalesce(tr.days_tracked, 1))) as walks_per_day,
	(
		select avg(g.day_avg_min) from daily_gap_avg g
		where g.dog_id = d.id and g.type_id = 'walk'
			and g.day > (now() at time zone 'Europe/Stockholm')::date - 30
	) as avg_walk_gap_min,
	(
		select avg((e.details ->> 'duration_min')::numeric) from events e
		where e.dog_id = d.id and e.type_id = 'walk'
			and e.occurred_at > now() - interval '30 days'
			and e.details ? 'duration_min'
	) as avg_walk_duration_min,
	(
		select avg(g.day_avg_min) from daily_gap_avg g
		where g.dog_id = d.id and g.type_id = 'meal'
			and g.day > (now() at time zone 'Europe/Stockholm')::date - 30
	) as avg_meal_gap_min,
	(
		select avg(case when (e.details ->> 'finished')::boolean then 1.0 else 0.0 end)
		from events e
		where e.dog_id = d.id and e.type_id = 'meal'
			and e.occurred_at > now() - interval '30 days'
			and e.details ? 'finished'
	) as meal_finish_rate,
	(
		select count(*)::numeric from events e
		where e.dog_id = d.id and e.type_id = 'accident'
			and e.occurred_at > now() - interval '30 days'
	) / greatest(1, least(30, coalesce(tr.days_tracked, 1))) as accidents_per_day,
	(
		select count(*)::numeric from events e
		where e.dog_id = d.id and e.type_id = 'accident'
			and e.occurred_at > now() - interval '84 days'
	) / (greatest(1, least(84, coalesce(tr.days_tracked, 1))) / 7.0) as accidents_per_week,
	(
		select count(*)::numeric from events e
		where e.dog_id = d.id and e.type_id = 'accident'
			and e.occurred_at > now() - interval '180 days'
	) / (greatest(1, least(180, coalesce(tr.days_tracked, 1))) / 30.0) as accidents_per_month,
	greatest(1, least(30, coalesce(tr.days_tracked, 1))) as days_counted
from dogs d
left join tracked tr on tr.dog_id = d.id;
