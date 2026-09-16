-- make the change to interval_days in order to track in hours and allow average to be used.
-- view is dropped since column names had to change, rather than replaced.
drop view dog_care_status;

alter table event_types
rename column interval_days to interval;

alter table event_types
add column interval_type text not null default 'days' check (interval_type in ('days', 'hours', 'average'));

create view
  dog_care_status
with
  (security_invoker = true) as
select
  d.id as dog_id,
  t.id as type_id,
  t.label,
  t.category,
  t.interval,
  t.interval_type,
  last.occurred_at as last_at,
  case
    when last.occurred_at is null then null
    when t.interval_type = 'days'
    and t.interval is not null then last.occurred_at + make_interval (days => t.interval)
    when t.interval_type = 'hours'
    and t.interval is not null then last.occurred_at + make_interval (hours => t.interval)
    when t.interval_type = 'average'
    and w.avg_gap_min is not null then last.occurred_at + w.avg_gap_min * interval '1 minute'
  end as due_at,
  t.icon,
  t.sort_order
from
  dogs d
  cross join event_types t
  left join lateral (
    select
      occurred_at
    from
      events e
    where
      e.dog_id = d.id
      and e.type_id = t.id
    order by
      e.occurred_at desc
    limit
      1
  ) last on true
  left join stats_type_windows w on w.dog_id = d.id
  and w.type_id = t.id
  and w.window_days = 30;

revoke all on dog_care_status from anon, authenticated;

grant
select
  on dog_care_status to authenticated;

grant
update (interval, interval_type) on event_types to authenticated;