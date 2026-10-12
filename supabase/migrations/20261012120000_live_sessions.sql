-- A live walk the server can see (plan 30). The walk itself stays on the phone;
-- this row only tells the remind function that someone is out with her, so the
-- "om 30 min" reminder stays quiet on both phones. One per dog and type.
create table live_sessions (
	dog_id uuid not null references dogs on delete cascade,
	type_id text not null references event_types on delete cascade,
	session_id uuid not null,
	-- Written by the app's server, not the phone: moving the walk's start must
	-- not move this before the last saved walk.
	created_at timestamptz not null default now(),
	primary key (dog_id, type_id)
);

alter table live_sessions enable row level security;

create policy member_access on live_sessions
	for all
	to authenticated
	using (
		exists (
			select 1 from public.dogs d
			where d.id = live_sessions.dog_id and public.is_household_member(d.household_id)
		)
	)
	with check (
		exists (
			select 1 from public.dogs d
			where d.id = live_sessions.dog_id and public.is_household_member(d.household_id)
		)
	);

-- New tables inherit every privilege on this project (see plan 19), so revoke first.
revoke all on live_sessions from anon, authenticated;
-- Update in full: a new walk replaces the old row by upsert, which writes every
-- column, and the policy already keeps the row to the household's dog.
grant select, insert, update, delete on live_sessions to authenticated;
grant all on live_sessions to service_role;
