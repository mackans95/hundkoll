// Called every minute by pg_cron (migration 20261001120000): reads Status,
// claims each reminder that has fallen due, and pushes it to the household's
// phones. `?dry&now=<iso>` answers what it would send at that moment, sending
// and claiming nothing, which is how the rules are checked against real data.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { reminderDue, reminderMessage, type ReminderRow } from '../_shared/reminders.ts';
import { send } from '../_shared/fcm.ts';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

type Due = {
	dog_id: string;
	household_id: string;
	row: ReminderRow;
	kind: 'soon' | 'week' | 'due';
};

Deno.serve(async (req) => {
	if (req.headers.get('x-remind-secret') !== Deno.env.get('REMIND_SECRET')) {
		return new Response('forbidden', { status: 403 });
	}
	const url = new URL(req.url);
	const dry = url.searchParams.has('dry');
	const now =
		dry && url.searchParams.get('now') ? new Date(url.searchParams.get('now')!) : new Date();

	const [status, absences, dogs] = await Promise.all([
		db.from('dog_care_status').select('*'),
		db
			.from('events')
			.select('dog_id, event_types!inner(category)')
			.eq('event_types.category', 'absence')
			.is('ended_at', null)
			.lte('occurred_at', now.toISOString()),
		db.from('dogs').select('id, household_id')
	]);
	if (status.error || absences.error || dogs.error) {
		console.error('remind read failed:', status.error ?? absences.error ?? dogs.error);
		return Response.json({ error: 'read failed' }, { status: 500 });
	}

	const away = new Set(absences.data.map((e) => e.dog_id));
	const household = new Map(dogs.data.map((d) => [d.id, d.household_id]));
	const due: Due[] = [];
	for (const row of status.data) {
		// The absence type is the banner on Status, not a card of its own.
		if (!row.dog_id || !row.type_id || row.category === 'absence') continue;
		const kind = reminderDue(row as ReminderRow, away.has(row.dog_id), now);
		if (kind) {
			due.push({
				dog_id: row.dog_id,
				household_id: household.get(row.dog_id)!,
				row: row as ReminderRow,
				kind
			});
		}
	}

	if (dry) {
		return Response.json({
			now: now.toISOString(),
			due: due.map(({ row, kind }) => ({
				type: row.type_id,
				kind,
				due_at: row.due_at,
				...reminderMessage(row, kind)
			}))
		});
	}

	// Without Firebase there is nobody to send to, and a claim would lose the reminder.
	const account = Deno.env.get('FCM_SERVICE_ACCOUNT');
	if (!account) {
		return Response.json({ error: 'FCM_SERVICE_ACCOUNT is not set' }, { status: 503 });
	}
	const sent: string[] = [];
	for (const { dog_id, household_id, row, kind } of due) {
		// The claim comes first: a run that overlaps this one finds the key taken.
		const claim = await db
			.from('reminders_sent')
			.upsert(
				{ dog_id, type_id: row.type_id, kind, due_at: row.due_at },
				{ ignoreDuplicates: true }
			)
			.select();
		if (claim.error || claim.data.length === 0) continue;

		const members = await db
			.from('household_members')
			.select('user_id')
			.eq('household_id', household_id);
		const devices = await db
			.from('push_devices')
			.select('token')
			.in(
				'user_id',
				(members.data ?? []).map((m) => m.user_id)
			);

		const message = reminderMessage(row, kind);
		for (const { token } of devices.data ?? []) {
			const result = await send(account, token, { ...message, tag: row.type_id, url: '/status' });
			if (result === 'unregistered') {
				await db.from('push_devices').delete().eq('token', token);
			}
		}
		sent.push(`${row.type_id}:${kind}`);
	}

	// Kept long enough to never re-send a still-current due time.
	await db
		.from('reminders_sent')
		.delete()
		.lt('sent_at', new Date(Date.now() - 90 * 86_400_000).toISOString());

	return Response.json({ sent });
});
