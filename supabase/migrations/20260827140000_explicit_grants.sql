-- State every table grant the app relies on, instead of inheriting them.
--
-- This project was created before Supabase stopped auto-granting anon and
-- authenticated on new tables, so production works on privileges no migration
-- ever asked for: anon holds INSERT, UPDATE, DELETE and TRUNCATE on every table
-- here, RLS being the only thing standing in front of them. The local stack
-- imitated that with auto_expose_new_tables = true, and that config field is
-- documented as removed on 2026-10-30 — after which a rebuilt database would
-- come up unreadable, looking like an RLS problem while being a GRANT problem.
-- With this file in place the flag is gone from config.toml.
--
-- Two migrations already did this for UPDATE (20260812150000, 20260821090000):
-- revoke what was inherited, grant back only the columns an edit may touch.
-- This finishes the job for the rest, so the grants read the same in production
-- as in a database rebuilt from these files.
--
-- Revoke first: revoking UPDATE on a table drops its column grants too, so the
-- order below is the whole reason this is safe to re-run.

revoke all on all tables in schema public from anon, authenticated;

-- PostgREST reaches the schema through this. Granted by the base project rather
-- than by the table auto-exposure, so it is not what expires — stated anyway,
-- since a migration that claims to state the grants should state them all.
grant usage on schema public to anon, authenticated;

-- The catalogue is the one thing that genuinely is public: its policy says
-- `public_read using (true)`, and it names activities rather than describing a
-- dog. Nothing in the app reads it unauthenticated — every route but /login
-- needs a session — but the policy invites it, so the grant matches the policy.
grant select on event_types to anon, authenticated;

-- Everything else is signed-in only. Note this is not merely convention: anon
-- cannot get past is_household_member, whose EXECUTE the initial migration
-- revokes from it, so reading any of these as anon raises "permission denied for
-- function" rather than returning nothing. A select grant here would be a
-- promise the database does not keep — which is why the stats views, granted to
-- anon when they were added, are authenticated-only from here.
grant select on households, household_members, dogs, events to authenticated;
grant select on dog_care_status to authenticated;
grant select on stats_type_buckets, stats_detail_buckets to authenticated;
grant select on stats_type_windows, stats_detail_windows to authenticated;

-- Writes are only what the app does, and only as a signed-in user. Logging an
-- event, correcting one, removing one, and changing an interval in Settings —
-- that is the whole list.
grant insert, delete on events to authenticated;
grant update (occurred_at, details, note) on events to authenticated;
grant update (interval_days) on event_types to authenticated;

-- Households, memberships and the dog are read-only to the app: the two users
-- and their household were created by hand, and nothing in the UI edits them.
-- They were writable by anon until this migration, purely by inheritance.

-- service_role bypasses RLS by design, and nothing in this project uses it — the
-- secret key appears nowhere in the app or the scripts. It is stated anyway
-- because the auto-exposure being retired covered this role too, so without it a
-- rebuilt database would come up with Studio's table editor unable to read.
grant all on all tables in schema public to service_role;

-- The detail views call this, and security_invoker means the caller needs it.
-- EXECUTE defaults to PUBLIC, so this changes nothing today; it is here so the
-- view's dependency is written down next to the view's grant.
grant execute on function public.detail_happened(jsonb) to authenticated;
