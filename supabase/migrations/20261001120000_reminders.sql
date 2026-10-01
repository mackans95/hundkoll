-- Reminders (plan 19): every minute pg_cron asks the `remind` Edge Function to
-- read Status and push what has fallen due to the phones that asked for it.
-- The function URL and its shared secret live in Vault, never here: the repo
-- is public. Until both are set, the tick does nothing.

-- One row per phone with reminders switched on. A token is the phone's FCM
-- address; it moves to whoever switched them on last on that phone.
create table push_devices (
	token text primary key,
	user_id uuid not null references auth.users on delete cascade,
	created_at timestamptz not null default now(),
	seen_at timestamptz not null default now()
);

alter table push_devices enable row level security;

create policy own_devices on push_devices
	for all to authenticated
	using (user_id = (select auth.uid()))
	with check (user_id = (select auth.uid()));

-- New tables still inherit every privilege on this project (see
-- 20260827140000_explicit_grants.sql), so revoke before granting.
revoke all on push_devices from anon, authenticated;
-- The switch adds and removes a row, and every launch refreshes seen_at.
grant select, insert, delete on push_devices to authenticated;
grant update (seen_at) on push_devices to authenticated;

-- What has been sent, keyed so a reminder goes out once: logging moves due_at,
-- which makes the next reminder a different key. Only the function, as
-- service_role, reads or writes it; RLS with no policy shuts everyone else out.
create table reminders_sent (
	dog_id uuid not null references dogs on delete cascade,
	type_id text not null references event_types on delete cascade,
	kind text not null check (kind in ('soon', 'week', 'due')),
	due_at timestamptz not null,
	sent_at timestamptz not null default now(),
	primary key (dog_id, type_id, kind, due_at)
);

alter table reminders_sent enable row level security;
revoke all on reminders_sent from anon, authenticated;

grant all on push_devices, reminders_sent to service_role;
-- The function reads Status as service_role, whose grant on the view went
-- when 20260916103106 dropped and recreated it.
grant select on dog_care_status to service_role;

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

-- Reads Vault inside the function so the cron command holds no secret, and
-- returns quietly while the two entries are missing (a fresh local stack).
create or replace function public.remind_tick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	url text;
	secret text;
begin
	select decrypted_secret into url from vault.decrypted_secrets where name = 'remind_url';
	select decrypted_secret into secret from vault.decrypted_secrets where name = 'remind_secret';
	if url is null or secret is null then
		return;
	end if;

	perform net.http_post(
		url := url,
		headers := jsonb_build_object('content-type', 'application/json', 'x-remind-secret', secret),
		body := '{}'::jsonb,
		timeout_milliseconds := 10000
	);
end;
$$;

revoke execute on function public.remind_tick() from public, anon, authenticated;

select cron.schedule('remind', '* * * * *', 'select public.remind_tick()');
