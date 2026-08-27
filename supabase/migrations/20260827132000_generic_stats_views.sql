-- Four generic stats views, on two axes: per type and per type × detail field,
-- each at bucket grain (a chart's columns) and window grain (a headline number).
--
-- The four they replace name types and detail keys in their own bodies — 'walk'
-- and 'meal' and 'pee' and 'finished' — so a new type could never read them, and
-- create-or-replace may only append columns, which made them a one-way ratchet.
-- Every generic feature so far has had to route around them. These name nothing.
--
-- Added here; the old four are dropped in the next migration, so both sets exist
-- in one database long enough to diff every number against its replacement.

-- Whether a stored detail value says something happened. `true` for a checkbox
-- or a reveal, above zero for a count — which is the same rule contribution()
-- in $lib/stats/detailDays.ts counts a tooltip by, so a tile and a tooltip can
-- no longer disagree about the same field. An absent key is NULL, and every
-- caller reads it through `case when`, which treats NULL as false.
--
-- A measured number is "above zero" too, so a share over duration_min reads
-- 100 %. That is meaningless rather than wrong: nothing can tell a count from a
-- measurement here, which is why the generator refuses share on a number field.
create function detail_happened(value jsonb) returns boolean
	language sql
	immutable
	-- No table references, so an empty search_path costs nothing and keeps the
	-- function out of Supabase's mutable-search_path warning.
	set search_path = ''
as $$
	select value = 'true'::jsonb
		or (jsonb_typeof(value) = 'number' and (value #>> '{}')::numeric > 0)
$$;

-- One row per dog × type × period × Stockholm bucket. period = 'day' is what
-- the daily charts read; 'week' and 'month' are what Trender compares.
create view stats_type_buckets
with (security_invoker = true) as
with gapped as (
	select
		dog_id,
		type_id,
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
	avg(e.gap_min) filter (where e.prev_day = e.day) as avg_gap_min
from gapped e
cross join (values ('day'), ('week'), ('month')) as p (period)
group by e.dog_id, e.type_id, p.period, bucket;

-- The same grain, one row further down: per detail field the bucket's own events
-- carry. `total` sums what was counted, `happened` counts the events it happened
-- in — a walk with two poops is 2 in one and 1 in the other.
create view stats_detail_buckets
with (security_invoker = true) as
with bucketed as (
	select
		e.dog_id,
		e.type_id,
		p.period,
		date_trunc(p.period, (e.occurred_at at time zone 'Europe/Stockholm')::date)::date
			as bucket,
		e.details
	from events e
	cross join (values ('day'), ('week'), ('month')) as p (period)
),
fields as (
	select distinct dog_id, type_id, period, bucket, jsonb_object_keys(details) as field
	from bucketed
)
select
	f.dog_id,
	f.type_id,
	f.period,
	f.bucket,
	f.field,
	count(*) as events,
	count(*) filter (where b.details ? f.field) as answered,
	count(*) filter (where detail_happened(b.details -> f.field)) as happened,
	-- Floored and never negative, matching contribution() rather than the ::int
	-- cast the old view used, which rounded a fraction up.
	sum(
		case
			when b.details -> f.field = 'true'::jsonb then 1
			when jsonb_typeof(b.details -> f.field) = 'number'
				then greatest(0, floor((b.details ->> f.field)::numeric))::int
			else 0
		end
	) as total,
	avg((b.details ->> f.field)::numeric)
		filter (where jsonb_typeof(b.details -> f.field) = 'number') as avg_number,
	-- Over the events that answered, not over every event: this is the meal
	-- finish rate, where a meal nobody recorded is not a meal she left.
	avg(case when detail_happened(b.details -> f.field) then 1.0 else 0.0 end)
		filter (where b.details ? f.field) as share_answered
from fields f
join bucketed b
	on b.dog_id = f.dog_id
	and b.type_id = f.type_id
	and b.period = f.period
	and b.bucket = f.bucket
group by f.dog_id, f.type_id, f.period, f.bucket, f.field;

-- One row per dog × type × trailing window, for the headline numbers. Built from
-- dogs × event_types so a type nobody has logged still reads 0 rather than
-- vanishing, which is what the wide summary view did.
create view stats_type_windows
with (security_invoker = true) as
with day_gaps as (
	select
		dog_id,
		type_id,
		(occurred_at at time zone 'Europe/Stockholm')::date as day,
		(lag(occurred_at) over w at time zone 'Europe/Stockholm')::date as prev_day,
		extract(epoch from occurred_at - lag(occurred_at) over w) / 60.0 as gap_min
	from events
	window w as (partition by dog_id, type_id order by occurred_at)
),
daily_gap_avg as (
	select dog_id, type_id, day, avg(gap_min) as day_avg_min
	from day_gaps
	where prev_day = day
	group by dog_id, type_id, day
),
tracked as (
	-- Tracking starts at the first routine event: those are logged in real time,
	-- whereas care and health events get backdated (an old vet visit, a
	-- historical weight) and must not stretch the averaging window. The category
	-- is exactly the walk/meal/accident list the old view spelled out.
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
)
select
	d.id as dog_id,
	t.id as type_id,
	w.window_days,
	coalesce(c.events, 0) as events,
	-- Rates divide by the days actually tracked, capped at the window: two days
	-- of data must not read as a thirtieth of a month.
	greatest(1, least(w.window_days, coalesce(tr.days_tracked, 1))) as days_counted,
	coalesce(c.events, 0)::numeric
		/ greatest(1, least(w.window_days, coalesce(tr.days_tracked, 1))) as per_day,
	coalesce(c.events, 0)::numeric
		/ (greatest(1, least(w.window_days, coalesce(tr.days_tracked, 1))) / 7.0) as per_week,
	coalesce(c.events, 0)::numeric
		/ (greatest(1, least(w.window_days, coalesce(tr.days_tracked, 1))) / 30.0) as per_month,
	g.avg_gap_min
from dogs d
cross join event_types t
cross join (values (30), (84), (180)) as w (window_days)
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
) g on true
left join tracked tr on tr.dog_id = d.id;

-- The detail axis at window grain: what a generated card's tiles read.
create view stats_detail_windows
with (security_invoker = true) as
with windows as (
	select * from (values (30), (84), (180)) as w (window_days)
),
in_window as (
	select e.dog_id, e.type_id, e.details, w.window_days
	from events e
	cross join windows w
	where e.occurred_at > now() - make_interval(days => w.window_days)
),
fields as (
	-- Deliberately every event ever, not just the window: a field answered once
	-- in March still has a share worth reporting in August, and dropping its row
	-- would read as "unknown" instead of "never".
	select distinct e.dog_id, e.type_id, w.window_days, jsonb_object_keys(e.details) as field
	from events e
	cross join windows w
)
select
	f.dog_id,
	f.type_id,
	f.window_days,
	f.field,
	-- events counts every event of the type; answered only those carrying this
	-- field. The gap is the point: a reveal stores nothing when nothing happened,
	-- so a share over rows that HAVE the key would read 100 % forever.
	-- share_not_true divides by every event instead.
	count(*) as events,
	count(*) filter (where i.details ? f.field) as answered,
	avg((i.details ->> f.field)::numeric)
		filter (where jsonb_typeof(i.details -> f.field) = 'number') as avg_number,
	avg(case when detail_happened(i.details -> f.field) then 1.0 else 0.0 end) as share_true,
	avg(case when detail_happened(i.details -> f.field) then 0.0 else 1.0 end) as share_not_true,
	-- Over the events that answered, where the two above divide by every event.
	-- The meal finish rate is this one: a meal logged from the tile without
	-- opening the dialog is not a meal she left.
	avg(case when detail_happened(i.details -> f.field) then 1.0 else 0.0 end)
		filter (where i.details ? f.field) as share_answered
from fields f
join in_window i
	on i.dog_id = f.dog_id
	and i.type_id = f.type_id
	and i.window_days = f.window_days
group by f.dog_id, f.type_id, f.window_days, f.field;

-- Stated rather than inherited: the older views are readable because this
-- project predates Supabase dropping auto-exposure, and that behaviour is
-- documented as removed on 2026-10-30. RLS still decides which rows, via
-- security_invoker.
grant select on stats_type_buckets to anon, authenticated;
grant select on stats_detail_buckets to anon, authenticated;
grant select on stats_type_windows to anon, authenticated;
grant select on stats_detail_windows to anon, authenticated;
