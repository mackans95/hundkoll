-- Hundkoll initial schema: households, dogs, event catalogue, events, RLS.

create table households (
	id uuid primary key default gen_random_uuid(),
	name text not null,
	created_at timestamptz not null default now()
);

create table household_members (
	household_id uuid not null references households(id) on delete cascade,
	user_id uuid not null references auth.users(id) on delete cascade,
	primary key (household_id, user_id)
);

create table dogs (
	id uuid primary key default gen_random_uuid(),
	household_id uuid not null references households(id) on delete cascade,
	name text not null,
	birth_date date,
	breed text,
	photo_path text,
	created_at timestamptz not null default now()
);

create table event_types (
	id text primary key,
	label text not null,
	category text not null check (category in ('routine', 'care', 'health')),
	interval_days int, -- null = no recurrence expectation
	icon text,
	sort_order int not null default 0
);

create table events (
	id uuid primary key default gen_random_uuid(),
	dog_id uuid not null references dogs(id) on delete cascade,
	type_id text not null references event_types(id),
	occurred_at timestamptz not null default now(),
	details jsonb not null default '{}'::jsonb,
	note text,
	created_by uuid references auth.users(id) default auth.uid(),
	created_at timestamptz not null default now()
);

create index events_dog_type_time on events (dog_id, type_id, occurred_at desc);

-- Membership check as security definer: policies on household_members would
-- otherwise recurse into their own table during evaluation.
create or replace function public.is_household_member(hid uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
	select exists (
		select 1 from public.household_members
		where household_id = hid and user_id = (select auth.uid())
	);
$$;

revoke execute on function public.is_household_member(uuid) from public, anon;
grant execute on function public.is_household_member(uuid) to authenticated;

alter table households enable row level security;
alter table household_members enable row level security;
alter table dogs enable row level security;
alter table events enable row level security;
alter table event_types enable row level security;

create policy member_access on households
	for all
	using (public.is_household_member(id))
	with check (public.is_household_member(id));

create policy member_access on household_members
	for all
	using (public.is_household_member(household_id))
	with check (public.is_household_member(household_id));

create policy member_access on dogs
	for all
	using (public.is_household_member(household_id))
	with check (public.is_household_member(household_id));

create policy member_access on events
	for all
	using (
		exists (
			select 1
			from dogs d
			join household_members m on m.household_id = d.household_id
			where d.id = events.dog_id and m.user_id = (select auth.uid())
		)
	)
	with check (
		exists (
			select 1
			from dogs d
			join household_members m on m.household_id = d.household_id
			where d.id = events.dog_id and m.user_id = (select auth.uid())
		)
		and created_by = (select auth.uid())
	);

-- Catalogue data: readable by everyone, written only via migrations.
create policy public_read on event_types for select using (true);

-- "last done / next due" lives in SQL, not in app code.
create view dog_care_status
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
	end as due_at
from dogs d
cross join event_types t
left join lateral (
	select occurred_at from events e
	where e.dog_id = d.id and e.type_id = t.id
	order by e.occurred_at desc limit 1
) last on true;

insert into event_types (id, label, category, interval_days, sort_order) values
	('walk',      'Promenad',      'routine', null, 10),
	('meal',      'Matning',       'routine', null, 20),
	('poop',      'Bajs',          'routine', null, 30),
	('nail_trim', 'Kloklippning',  'care',    42,   40),
	('grooming',  'Pälsklippning', 'care',    70,   50),
	('bath',      'Bad',           'care',    56,   60),
	('deworming', 'Avmaskning',    'health',  90,   70),
	('vet',       'Veterinär',     'health',  365,  80),
	('weight',    'Vägning',       'health',  30,   90);
