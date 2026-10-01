// The pure half of live walk logging: storage parsing, clock-derived
// durations and the exact form fields a finished walk submits.

import { describe, expect, it } from 'vitest';
import {
	buildWalkFields,
	durationMinutes,
	elapsedMinutes,
	fixedWalkFields,
	parseStoredWalk,
	reconcileWalk,
	type ActiveWalk
} from '$lib/offline/liveWalk';
import * as time from '$lib/time';

const walk: ActiveWalk = {
	id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
	typeId: 'walk',
	startedAt: '2026-08-20T10:00:00.000Z',
	pee: 2,
	poop: 1,
	note: 'regn'
};

describe('parseStoredWalk', () => {
	it('round-trips a stored walk', () => {
		expect(parseStoredWalk(JSON.stringify(walk))).toEqual(walk);
	});

	it('refuses nothing-values and garbage instead of crashing the page', () => {
		expect(parseStoredWalk(null)).toBeNull();
		expect(parseStoredWalk('')).toBeNull();
		expect(parseStoredWalk('not json')).toBeNull();
		expect(parseStoredWalk('{}')).toBeNull();
		expect(parseStoredWalk(JSON.stringify({ ...walk, id: '' }))).toBeNull();
		expect(parseStoredWalk(JSON.stringify({ ...walk, startedAt: 'never' }))).toBeNull();
	});

	it('sanitizes counts and the note rather than trusting them', () => {
		const messy = JSON.stringify({ ...walk, pee: -3, poop: 2.7, note: 42 });
		expect(parseStoredWalk(messy)).toEqual({ ...walk, pee: 0, poop: 2, note: '' });
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
});

describe('buildWalkFields', () => {
	const end = new Date('2026-08-20T10:35:00.000Z');

	it('posts exactly what the dialog would, with occurred_at at the start', () => {
		expect(buildWalkFields(walk, end)).toEqual({
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
		const fields = buildWalkFields(walk, end);
		expect(time.stockholmInputToUtc(fields.occurred_at)?.toISOString()).toBe(walk.startedAt);
	});

	it('takes a confirmed duration override, clamped to at least a minute', () => {
		expect(buildWalkFields(walk, end, 90).duration_min).toBe('90');
		expect(buildWalkFields(walk, end, 0).duration_min).toBe('1');
	});
});

// The lock screen (plan 20) saves with these plus the three it fills in at the
// tap; together they must be exactly what the card's Avsluta would post.
describe('fixedWalkFields', () => {
	it('is buildWalkFields without the end-of-walk values', () => {
		const full = buildWalkFields(walk, new Date('2026-08-20T10:30:00.000Z'));
		const { duration_min, pee, poop, ...rest } = full;
		expect(fixedWalkFields(walk)).toEqual(rest);
		expect([duration_min, pee, poop]).toEqual(['30', '2', '1']);
	});
});

describe('reconcileWalk', () => {
	it('keeps a page with no walk as it is', () => {
		expect(reconcileWalk(null, { id: walk.id, pee: 3, poop: 1 })).toEqual({ kind: 'keep' });
	});

	// Taps on the lock screen while the app slept: native holds the newer counts.
	it("adopts the lock screen's counts for the same walk", () => {
		expect(reconcileWalk(walk, { id: walk.id, pee: 4, poop: 1 })).toEqual({
			kind: 'adopt',
			pee: 4,
			poop: 1
		});
	});

	it('keeps the page when the counts already agree', () => {
		expect(reconcileWalk(walk, { id: walk.id, pee: 2, poop: 1 })).toEqual({ kind: 'keep' });
	});

	// Spara took it, whether it sent or went to the outbox; it must not run on.
	it("ends the page's walk once Spara has taken it", () => {
		expect(reconcileWalk(walk, { savedId: walk.id })).toEqual({ kind: 'saved' });
	});

	// A walk started after the last Spara, or the notification switched off.
	it('ignores a lock screen holding another walk, or none', () => {
		expect(reconcileWalk(walk, { id: 'other', pee: 9, poop: 9, savedId: 'older' })).toEqual({
			kind: 'keep'
		});
		expect(reconcileWalk(walk, {})).toEqual({ kind: 'keep' });
	});
});
