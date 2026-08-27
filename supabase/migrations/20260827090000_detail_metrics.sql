-- Headline metrics for any event type, without a column per metric.
--
-- Every metric on the hand-written cards is its own column in stats_summary
-- with the type baked into a subquery (avg_walk_duration_min,
-- meal_finish_rate). That does not scale to generated cards: adding one would
-- mean replacing a view that has already been replaced four times, and
-- create-or-replace may only append columns. So this is long instead of wide —
-- one row per dog × type × detail field — and a new type needs no migration at
-- all.
--
-- Checked against the hand-written columns before being written: for
-- walk/duration_min avg_number is 15.457, matching avg_walk_duration_min, and
-- for meal/finished share_true is 0.978, matching meal_finish_rate.

create view stats_detail_metrics
with (security_invoker = true) as
with in_window as (
	-- 30 days, the same window every other headline number on the stats
	-- screen uses, so a generated tile means what a hand-written one means.
	select dog_id, type_id, details
	from events
	where occurred_at > now() - interval '30 days'
),
fields as (
	-- Deliberately every event ever, not just the window: a field that was
	-- answered once in March still has a share worth reporting in August,
	-- and dropping its row would read as "unknown" instead of "never".
	select distinct dog_id, type_id, jsonb_object_keys(details) as field
	from events
)
select
	f.dog_id,
	f.type_id,
	f.field,
	-- events counts every event of the type; answered only those carrying
	-- this field. The gap between them is the point: a reveal stores nothing
	-- when nothing happened, so a share over rows that HAVE the key would
	-- read 100% forever. share_not_true divides by every event instead.
	count(*) as events,
	count(*) filter (where w.details ? f.field) as answered,
	avg((w.details ->> f.field)::numeric)
		filter (where jsonb_typeof(w.details -> f.field) = 'number') as avg_number,
	avg(case when w.details -> f.field = 'true'::jsonb then 1.0 else 0.0 end) as share_true,
	avg(case when w.details -> f.field = 'true'::jsonb then 0.0 else 1.0 end) as share_not_true
from fields f
join in_window w on w.dog_id = f.dog_id and w.type_id = f.type_id
group by f.dog_id, f.type_id, f.field;

-- Stated rather than inherited. The existing views are readable because this
-- project was created before Supabase stopped auto-exposing new tables, and
-- that behaviour is documented as removed on 2026-10-30; a view added now
-- should not depend on it. RLS still decides which rows, via security_invoker.
grant select on stats_detail_metrics to anon, authenticated;
