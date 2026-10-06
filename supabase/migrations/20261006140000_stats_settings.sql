-- Which Statistik cards show, in order (plan 28). One row per household; no
-- row means every card in CHARTED_TYPES order (src/lib/stats/palette.ts).
-- Read back against that list in code, so a generated card joins without a
-- migration and a removed one drops out.
create table stats_settings (
	household_id uuid primary key references households on delete cascade,
	cards jsonb not null
);

alter table stats_settings enable row level security;

create policy member_access on stats_settings
	for all to authenticated
	using (public.is_household_member(household_id))
	with check (public.is_household_member(household_id));

-- New tables still inherit every privilege on this project (see
-- 20260827140000_explicit_grants.sql), so revoke before granting.
revoke all on stats_settings from anon, authenticated;
grant select, insert on stats_settings to authenticated;
grant update (cards) on stats_settings to authenticated;
grant all on stats_settings to service_role;
