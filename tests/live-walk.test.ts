// The pure half of live walk logging: storage parsing, clock-derived
// durations and the exact form fields a finished walk submits.

import { describe, expect, it } from 'vitest';
import {
	buildWalkFields,
	durationMinutes,
	elapsedMinutes,
	parseStoredWalk,
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
