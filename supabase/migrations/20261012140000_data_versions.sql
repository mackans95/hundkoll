-- Plan 31b: one number per household that moves on every write the app's pages
-- show. The phone keeps each page and asks only whether this moved since; it
-- catches the other phone's logs and the lock screen's as well as its own.
create table data_versions (
	household_id uuid primary key references households on delete cascade,
	version bigint not null default 0
);

alter table data_versions enable row level security;

create policy member_read on data_versions
	for select
	to authenticated
	using (public.is_household_member(household_id));

-- New tables inherit every privilege on this project (see plan 19), so revoke
-- first. Read only: the triggers below are the only writers.
revoke all on data_versions from anon, authenticated;
grant select on data_versions to authenticated;

create function public.bump_data_version(hid uuid)
returns void
language sql
security definer
set search_path = ''
as $$
	insert into public.data_versions (household_id, version) values (hid, 1)
	on conflict (household_id) do update set version = public.data_versions.version + 1;
$$;

revoke execute on function public.bump_data_version(uuid) from public, anon, authenticated;

-- events and live data: the household is the dog's.
create function public.bump_data_version_by_dog()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	perform public.bump_data_version(d.household_id)
	from public.dogs d
	where d.id = coalesce(new.dog_id, old.dog_id);
	return null;
end;
$$;

-- The settings tables and dogs carry the household themselves.
create function public.bump_data_version_by_household()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	perform public.bump_data_version(coalesce(new.household_id, old.household_id));
	return null;
end;
$$;

-- The catalogue is shared: an edited interval moves every household.
create function public.bump_data_version_everywhere()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	perform public.bump_data_version(h.id) from public.households h;
	return null;
end;
$$;

create trigger data_version after insert or update or delete on events
	for each row execute function public.bump_data_version_by_dog();
create trigger data_version after insert or update or delete on type_settings
	for each row execute function public.bump_data_version_by_household();
create trigger data_version after insert or update or delete on stats_settings
	for each row execute function public.bump_data_version_by_household();
create trigger data_version after insert or update or delete on trend_settings
	for each row execute function public.bump_data_version_by_household();
create trigger data_version after insert or update or delete on dogs
	for each row execute function public.bump_data_version_by_household();
create trigger data_version after insert or update or delete on event_types
	for each statement execute function public.bump_data_version_everywhere();
