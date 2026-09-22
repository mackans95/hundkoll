-- Away mode: the dog is with someone else for a while. An absence is an
-- ordinary event whose occurred_at is the hand-over, with an end in a column
-- of its own — null while she is still away. The category is the fact every
-- reader keys on, the way 'routine' already decides when tracking started:
-- the views subtract the span, skip the gaps across it and count the daily
-- schedules from the return; the app renders a second time field for it.
--
-- A column rather than a detail key so the views never read jsonb by name,
-- and the database owns the "end after start" rule.

alter table event_types drop constraint event_types_category_check;
alter table event_types add constraint event_types_category_check
	check (category in ('routine', 'care', 'health', 'other', 'absence'));

alter table events add column ended_at timestamptz
	constraint events_ended_after_start check (ended_at is null or ended_at > occurred_at);

insert into event_types (id, label, category, interval, interval_type, icon, sort_order)
values ('away', 'Hundvakt', 'absence', null, 'days', '🧳', 110);

-- Hemma igen is an update of this one column; the other three were granted in
-- 20260827140000_explicit_grants.sql.
grant update (ended_at) on events to authenticated;

-- Every column below is appended, so all three views are replaced in place
-- and keep their grants.

-- A gap that overlaps an absence is not a gap between logged walks — the sitter
-- walked her in between, unlogged — so it is left out of the mean.
create or replace view stats_type_buckets
with (security_invoker = true) as
with absences as (
	select e.dog_id, tstzrange(e.occurred_at, coalesce(e.ended_at, now())) as span
	from events e
	join event_types t on t.id = e.type_id
	where t.category = 'absence'
),
gapped as (
	select
		dog_id,
		type_id,
		occurred_at,
		lag(occurred_at) over w as prev_at,
		(occurred_at at time zone 'Europe/Stockholm')::date as day,
		(lag(occurred_at) over w at time zone 'Europe/Stockholm')::date as prev_day,
		extract(epoch from occurred_at - lag(occurred_at) over w) / 60.0 as gap_min
	from events
	window w as (partition by dog_id, type_id order by occurred_at)
)
select
	e.dog_id,
	e.type_id,
	p.period,
	date_trunc(p.period, e.day)::date as bucket,
	count(*) as n,
	-- Within-day gaps only, pooled over the bucket: the overnight 22:00 → 07:30
	-- stretch would otherwise dominate every number.
	avg(e.gap_min) filter (
		where e.prev_day = e.day
			and not exists (
				select 1 from absences a
				where a.dog_id = e.dog_id and a.span && tstzrange(e.prev_at, e.occurred_at)
			)
	) as avg_gap_min
from gapped e
cross join (values ('day'), ('week'), ('month')) as p (period)
group by e.dog_id, e.type_id, p.period, bucket;

-- away_days is appended: the time she was away inside the window, in days.
-- Every rate divides by the days tracked minus that, so eight hours away make
-- the day count as two thirds of one. days_counted stays the whole-day figure.
create or replace view stats_type_windows
with (security_invoker = true) as
with absences as (
	select e.dog_id, tstzrange(e.occurred_at, coalesce(e.ended_at, now())) as span
	from events e
	join event_types t on t.id = e.type_id
	where t.category = 'absence'
),
day_gaps as (
	select
		dog_id,
		type_id,
		occurred_at,
		lag(occurred_at) over w as prev_at,
		(occurred_at at time zone 'Europe/Stockholm')::date as day,
		(lag(occurred_at) over w at time zone 'Europe/Stockholm')::date as prev_day,
		extract(epoch from occurred_at - lag(occurred_at) over w) / 60.0 as gap_min
	from events
	window w as (partition by dog_id, type_id order by occurred_at)
),
daily_gap_avg as (
	select g.dog_id, g.type_id, g.day, avg(g.gap_min) as day_avg_min
	from day_gaps g
	where g.prev_day = g.day
		and not exists (
			select 1 from absences a
			where a.dog_id = g.dog_id and a.span && tstzrange(g.prev_at, g.occurred_at)
		)
	group by g.dog_id, g.type_id, g.day
),
tracked as (
	-- Tracking starts at the first routine event: those are logged in real time,
	-- whereas care and health events get backdated (an old vet visit, a
	-- historical weight) and must not stretch the averaging window.
	select
		e.dog_id,
		(
			(now() at time zone 'Europe/Stockholm')::date
			- min((e.occurred_at at time zone 'Europe/Stockholm'))::date
		) + 1 as days_tracked
	from events e
	join event_types t on t.id = e.type_id
	where t.category = 'routine'
	group by e.dog_id
),
windows as (
	select * from (values (30), (84), (180)) as w (window_days)
),
away as (
	-- range_agg unions the spans first, so two overlapping absences count once.
	select r.dog_id, r.window_days,
		sum(extract(epoch from upper(r.part) - lower(r.part))) / 86400.0 as away_days
	from (
		select s.dog_id, w.window_days,
			unnest(range_agg(s.span * tstzrange(now() - make_interval(days => w.window_days), now())))
				as part
		from absences s
		cross join windows w
		group by s.dog_id, w.window_days
	) r
	group by r.dog_id, r.window_days
)
select
	d.id as dog_id,
	t.id as type_id,
	w.window_days,
	coalesce(c.events, 0) as events,
	n.days_counted,
	coalesce(c.events, 0)::numeric / h.days_home as per_day,
	coalesce(c.events, 0)::numeric / (h.days_home / 7.0) as per_week,
	coalesce(c.events, 0)::numeric / (h.days_home / 30.0) as per_month,
	g.avg_gap_min,
	coalesce(aw.away_days, 0) as away_days
from dogs d
cross join event_types t
cross join windows w
left join tracked tr on tr.dog_id = d.id
left join away aw on aw.dog_id = d.id and aw.window_days = w.window_days
-- Rates divide by the days actually tracked, capped at the window: two days
-- of data must not read as a thirtieth of a month.
cross join lateral (
	select greatest(1, least(w.window_days, coalesce(tr.days_tracked, 1))) as days_counted
) n
cross join lateral (
	select greatest(1, n.days_counted - coalesce(aw.away_days, 0)) as days_home
) h
left join lateral (
	select count(*) as events
	from events e
	where e.dog_id = d.id
		and e.type_id = t.id
		and e.occurred_at > now() - make_interval(days => w.window_days)
) c on true
left join lateral (
	select avg(a.day_avg_min) as avg_gap_min
	from daily_gap_avg a
	where a.dog_id = d.id
		and a.type_id = t.id
		and a.day > (now() at time zone 'Europe/Stockholm')::date - w.window_days
) g on true;

-- due_from is appended: the instant due_at counts from. The last event, unless
-- the type is daily and that event predates the latest finished absence — then
-- the return, since the sitter's walks were never logged. An event logged
-- during the absence (a meal the sitter texted about) still counts from itself.
create or replace view dog_care_status
with (security_invoker = true) as
select
	d.id as dog_id,
	t.id as type_id,
	t.label,
	t.category,
	t.interval,
	t.interval_type,
	last.occurred_at as last_at,
	case
		when anchor.due_from is null then null
		when t.interval_type = 'days' and t.interval is not null
			then anchor.due_from + make_interval(days => t.interval)
		when t.interval_type = 'hours' and t.interval is not null
			then anchor.due_from + make_interval(hours => t.interval)
		when t.interval_type = 'average' and w.avg_gap_min is not null
			then anchor.due_from + w.avg_gap_min * interval '1 minute'
	end as due_at,
	t.icon,
	t.sort_order,
	anchor.due_from
from dogs d
cross join event_types t
left join lateral (
	select occurred_at
	from events e
	where e.dog_id = d.id and e.type_id = t.id
	order by e.occurred_at desc
	limit 1
) last on true
left join lateral (
	select e.occurred_at as left_at, e.ended_at as returned_at
	from events e
	join event_types x on x.id = e.type_id
	where e.dog_id = d.id and x.category = 'absence' and e.ended_at is not null
	order by e.ended_at desc
	limit 1
) ret on true
cross join lateral (
	select case
		when t.interval_type <> 'days' and last.occurred_at < ret.left_at then ret.returned_at
		else last.occurred_at
	end as due_from
) anchor
left join stats_type_windows w
	on w.dog_id = d.id and w.type_id = t.id and w.window_days = 30;
