-- Seeds the LOCAL database only. `supabase db reset` runs this after the
-- migrations; `supabase db push` never runs seeds at all, so nothing here can
-- reach production.
--
-- What it makes is a working app with an empty history: one login, one
-- household, one dog. `npm run db-pull` optionally replaces the history with a
-- snapshot of production's, keeping this login and attaching it to the real
-- household.

-- The local login: dev@local / localdev
--
-- There is no signup flow — production's two users were made by hand — so a
-- user inserted here is the whole account. crypt(…, gen_salt('bf')) is the same
-- mechanism the README documents for resetting a password by hand.
--
-- The id is fixed rather than generated: db-pull rewrites production's user ids
-- to it, and a stable id keeps a reset from invalidating the rows it wrote.
-- The four token columns are set to '' rather than left NULL: they have no
-- column default, and GoTrue reads them into non-nullable strings — a NULL
-- comes back as "Database error querying schema" on every login attempt.
insert into auth.users (
	instance_id, id, aud, role, email, encrypted_password,
	email_confirmed_at, created_at, updated_at,
	raw_app_meta_data, raw_user_meta_data,
	confirmation_token, recovery_token, email_change_token_new, email_change
)
values (
	'00000000-0000-0000-0000-000000000000',
	'00000000-0000-4000-8000-000000000001',
	'authenticated',
	'authenticated',
	'dev@local',
	crypt('localdev', gen_salt('bf')),
	now(), now(), now(),
	'{"provider": "email", "providers": ["email"]}'::jsonb,
	'{}'::jsonb,
	'', '', '', ''
);

-- GoTrue resolves a password login through identities, not through users.email
-- alone, so without this row the login fails with invalid credentials.
insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
values (
	'00000000-0000-4000-8000-000000000001',
	'00000000-0000-4000-8000-000000000001',
	'{"sub": "00000000-0000-4000-8000-000000000001", "email": "dev@local", "email_verified": true, "phone_verified": false}'::jsonb,
	'email',
	now(), now()
);

-- Fixed ids here too, so a snapshot that truncates these tables and a run
-- without one both leave the same shape behind.
insert into households (id, name)
values ('00000000-0000-4000-8000-0000000000a1', 'Lokal');

insert into household_members (household_id, user_id)
values (
	'00000000-0000-4000-8000-0000000000a1',
	'00000000-0000-4000-8000-000000000001'
);

insert into dogs (id, household_id, name, birth_date, breed)
values (
	'00000000-0000-4000-8000-0000000000b1',
	'00000000-0000-4000-8000-0000000000a1',
	'Testhund',
	'2024-01-15',
	'Blandras'
);
