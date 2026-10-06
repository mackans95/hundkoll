-- Which rows Trender shows, in order (plan 27). One row per household; no row
-- means the defaults in src/lib/stats/trendConfig.ts, so an empty list stays a
-- real choice. Validated in code on save and on read: a row naming a type or
-- field since removed is skipped rather than failing the page.
create table trend_settings (
	household_id uuid primary key references households on delete cascade,
	rows jsonb not null
);

alter table trend_settings enable row level security;

create policy member_access on trend_settings
	for all to authenticated
	using (public.is_household_member(household_id))
	with check (public.is_household_member(household_id));

-- New tables still inherit every privilege on this project (see
-- 20260827140000_explicit_grants.sql), so revoke before granting.
revoke all on trend_settings from anon, authenticated;
grant select, insert on trend_settings to authenticated;
grant update (rows) on trend_settings to authenticated;
grant all on trend_settings to service_role;
