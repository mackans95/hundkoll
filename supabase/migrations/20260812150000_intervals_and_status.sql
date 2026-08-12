-- Only the care routines run on fixed intervals; deworming, vet visits and
-- weighing happen when they happen. Intervals are tunable from the app's
-- settings page, so this is just the new default.

update event_types set interval_days = null where id in ('deworming', 'vet', 'weight');

-- Let household members tune intervals from the app. RLS permits the update;
-- column-level grants restrict it to interval_days so the catalogue itself
-- (ids, labels, categories) stays migration-managed.
create policy member_update on event_types
	for update
	to authenticated
	using (true)
	with check (true);

revoke update on event_types from authenticated, anon;
grant update (interval_days) on event_types to authenticated;

-- Expose icon and sort_order through the status view (columns may only be
-- appended in a create-or-replace).
create or replace view dog_care_status
with (security_invoker = true) as
select
	d.id as dog_id,
	t.id as type_id,
	t.label,
	t.category,
	t.interval_days,
	last.occurred_at as last_at,
	case when t.interval_days is not null and last.occurred_at is not null
		then last.occurred_at + make_interval(days => t.interval_days)
	end as due_at,
	t.icon,
	t.sort_order
from dogs d
cross join event_types t
left join lateral (
	select occurred_at from events e
	where e.dog_id = d.id and e.type_id = t.id
	order by e.occurred_at desc limit 1
) last on true;
