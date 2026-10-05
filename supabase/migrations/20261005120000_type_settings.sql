-- How the household wants each type shown (plan 26). Kept off event_types:
-- that is the catalogue, readable by anon, and these are one household's
-- choices. Plans 27–29 add their own columns here.
--
-- Every setting column is nullable and null means "the default in code"
-- (src/lib/typeSettings.ts), so a missing row and a row saved for one setting
-- both leave the others at their defaults.
create table type_settings (
	household_id uuid not null references households on delete cascade,
	type_id text not null references event_types on delete cascade,
	-- A key into the palette in src/lib/stats/palette.ts, not a colour, so the
	-- palette can be re-stepped without touching rows. An unknown key reads as
	-- the default rather than failing a check.
	chart_color text,
	primary key (household_id, type_id)
);

alter table type_settings enable row level security;

create policy member_access on type_settings
	for all to authenticated
	using (public.is_household_member(household_id))
	with check (public.is_household_member(household_id));

-- New tables still inherit every privilege on this project (see
-- 20260827140000_explicit_grants.sql), so revoke before granting.
revoke all on type_settings from anon, authenticated;
-- Saving updates the row, or inserts it the first time. The key columns stay
-- out of the update grant, so a row cannot be moved to another type.
grant select, insert on type_settings to authenticated;
grant update (chart_color) on type_settings to authenticated;
grant all on type_settings to service_role;
