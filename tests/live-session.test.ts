// The pure half of live logging (plans 1, 20, 23): storage parsing, the old
// walk shape, clock-derived durations, the exact form fields a finished walk
// submits, and lining the page up with the lock screen.

import { describe, expect, it } from 'vitest';
import {
	buildSessionFields,
	durationMinutes,
	elapsedMinutes,
	fixedSessionFields,
	parseStoredSession,
	reconcileSession,
	type LiveSession
} from '$lib/offline/liveSession';
import * as time from '$lib/time';

const walk: LiveSession = {
	id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
	typeId: 'walk',
	startedAt: '2026-08-20T10:00:00.000Z',
	endedAt: null,
	counts: { pee: 2, poop: 1 },
	note: 'regn'
};

const alone: LiveSession = {
	id: 'ffffffff-bbbb-cccc-dddd-eeeeeeeeeeee',
	typeId: 'alone',
	startedAt: '2026-10-03T08:00:00.000Z',
	endedAt: null,
	counts: {},
	note: ''
};

describe('parseStoredSession', () => {
	it('round-trips a stored session', () => {
		expect(parseStoredSession(JSON.stringify(walk))).toEqual(walk);
		const stopped = { ...alone, endedAt: '2026-10-03T08:23:00.000Z' };
		expect(parseStoredSession(JSON.stringify(stopped))).toEqual(stopped);
	});

	// A walk running when plan 23 deploys was stored with pee and poop at the top.
	it('reads a walk stored in the old shape into counts', () => {
		const old = {
			id: walk.id,
			typeId: 'walk',
			startedAt: walk.startedAt,
			pee: 2,
			poop: 1,
			note: 'regn'
		};
		expect(parseStoredSession(JSON.stringify(old))).toEqual(walk);
	});

	it('refuses nothing-values and garbage instead of crashing the page', () => {
		expect(parseStoredSession(null)).toBeNull();
		expect(parseStoredSession('')).toBeNull();
		expect(parseStoredSession('not json')).toBeNull();
		expect(parseStoredSession('{}')).toBeNull();
		expect(parseStoredSession(JSON.stringify({ ...walk, id: '' }))).toBeNull();
		expect(parseStoredSession(JSON.stringify({ ...walk, startedAt: 'never' }))).toBeNull();
	});

	it('sanitizes counts, the end and the note rather than trusting them', () => {
		const messy = JSON.stringify({
			...walk,
			counts: { pee: -3, poop: 2.7 },
			endedAt: 'soon',
			note: 42
		});
		expect(parseStoredSession(messy)).toEqual({ ...walk, counts: { pee: 0, poop: 2 }, note: '' });
	});
});

describe('elapsed and duration', () => {
	const at = (minutes: number) => new Date(Date.parse(walk.startedAt) + minutes * 60_000);

	it('floors the display and rounds the saved duration', () => {
		expect(elapsedMinutes(walk, at(23.8))).toBe(23);
		expect(durationMinutes(walk, at(23.8))).toBe(24);
	});

	it('shows zero right after starting but never saves less than one minute', () => {
		expect(elapsedMinutes(walk, at(0.5))).toBe(0);
		expect(durationMinutes(walk, at(0.5))).toBe(1);
	});

	it('clamps a clock moved backwards mid-walk', () => {
		expect(elapsedMinutes(walk, at(-10))).toBe(0);
		expect(durationMinutes(walk, at(-10))).toBe(1);
	});

	// Hemma stops the clock: answering an hour later must not add the hour.
	it('stops at Hemma, however long the answer takes', () => {
		const stopped = { ...alone, endedAt: '2026-10-03T08:23:00.000Z' };
		const muchLater = new Date('2026-10-03T09:30:00.000Z');
		expect(durationMinutes(stopped, muchLater)).toBe(23);
		expect(elapsedMinutes(stopped, muchLater)).toBe(23);
	});
});

describe('buildSessionFields', () => {
	const end = new Date('2026-08-20T10:35:00.000Z');

	it('posts exactly what the dialog would, with occurred_at at the start', () => {
		expect(buildSessionFields(walk, end)).toEqual({
			type_id: 'walk',
			detailed: '1',
			event_id: walk.id,
			// 10:00Z is 12:00 Stockholm wall clock in August.
			occurred_at: '2026-08-20T12:00',
			duration_min: '35',
			pee: '2',
			poop: '1',
			note: 'regn'
		});
	});

	it('round-trips occurred_at through the parser the action uses', () => {
		const fields = buildSessionFields(walk, end);
		expect(time.stockholmInputToUtc(fields.occurred_at)?.toISOString()).toBe(walk.startedAt);
	});

	it('takes a confirmed duration override, clamped to at least a minute', () => {
		expect(buildSessionFields(walk, end, 90).duration_min).toBe('90');
		expect(buildSessionFields(walk, end, 0).duration_min).toBe('1');
	});
});

// The lock screen (plan 20) saves with these plus the three it fills in at the
// tap; together they must be exactly what the card's Avsluta would post.
describe('fixedSessionFields', () => {
	it('is buildSessionFields without the end-of-walk values', () => {
		const full = buildSessionFields(walk, new Date('2026-08-20T10:30:00.000Z'));
		const { duration_min, pee, poop, ...rest } = full;
		expect(fixedSessionFields(walk)).toEqual(rest);
		expect([duration_min, pee, poop]).toEqual(['30', '2', '1']);
	});
});

describe('reconcileSession', () => {
	it('keeps a page with nothing running as it is', () => {
		expect(reconcileSession(null, { id: walk.id, pee: 3, poop: 1 })).toEqual({ kind: 'keep' });
	});

	// Taps on the lock screen while the app slept: native holds the newer counts.
	it("adopts the lock screen's counts for the same walk", () => {
		expect(reconcileSession(walk, { id: walk.id, pee: 4, poop: 1 })).toEqual({
			kind: 'adopt',
			counts: { pee: 4, poop: 1 }
		});
	});

	it('keeps the page when the counts already agree', () => {
		expect(reconcileSession(walk, { id: walk.id, pee: 2, poop: 1 })).toEqual({ kind: 'keep' });
	});

	// Hemma on the lock screen: the page stops too, at the lock screen's instant.
	it('takes the stop from the lock screen', () => {
		const at = Date.parse('2026-10-03T08:23:00.000Z');
		expect(reconcileSession(alone, { id: alone.id, endedAt: at })).toEqual({
			kind: 'stopped',
			endedAt: '2026-10-03T08:23:00.000Z'
		});
		// Already stopped in the page: the page's own instant stands.
		const stopped = { ...alone, endedAt: '2026-10-03T08:20:00.000Z' };
		expect(reconcileSession(stopped, { id: alone.id, endedAt: at })).toEqual({ kind: 'keep' });
	});

	// An Ensamtid has no counts; the lock screen's zeroes must not invent any.
	it('does not give a timing session counts', () => {
		expect(reconcileSession(alone, { id: alone.id, pee: 0, poop: 0, endedAt: 0 })).toEqual({
			kind: 'keep'
		});
	});

	// Spara took it, whether it sent or went to the outbox; it must not run on.
	it("ends the page's walk once Spara has taken it", () => {
		expect(reconcileSession(walk, { savedId: walk.id })).toEqual({ kind: 'saved' });
	});

	// A walk started after the last Spara, or the notification switched off.
	it('ignores a lock screen holding another session, or none', () => {
		expect(reconcileSession(walk, { id: 'other', pee: 9, poop: 9, savedId: 'older' })).toEqual({
			kind: 'keep'
		});
		expect(reconcileSession(walk, {})).toEqual({ kind: 'keep' });
	});
});
