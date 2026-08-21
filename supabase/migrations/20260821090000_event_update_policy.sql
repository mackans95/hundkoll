-- Let household members edit each other's events.
--
-- member_access (initial schema) governs updates too, but its `with check`
-- requires created_by = auth.uid() — so editing a row the partner logged
-- fails, since created_by stays theirs. Permissive policies OR together, so
-- adding a policy whose check is membership alone is enough; member_access
-- keeps guarding inserts, where created_by must still be the author.
create policy member_update on events
	for update
	to authenticated
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
	);

-- Column grants, the same way event_types.interval_days is opened up: an edit
-- may change what happened, never which row it is, whose dog it is, which
-- activity it was, or who logged it. Enforced by the database, so no app bug
-- can reassign or launder a row. (Changing the type is deliberately
-- unsupported — delete and log again keeps details consistent with the
-- type's field list.)
revoke update on events from authenticated, anon;
grant update (occurred_at, details, note) on events to authenticated;
