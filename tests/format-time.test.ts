// Durations as a clock reads them, never as a fraction of an hour.

import { describe, expect, it } from 'vitest';
import { countdownText, minutesText } from '$lib/format';

describe('minutesText', () => {
	it('stays in minutes under an hour', () => {
		expect(minutesText(36)).toBe('36 min');
		expect(minutesText(59.4)).toBe('59 min');
	});

	it('splits hours and minutes from the hour on', () => {
		expect(minutesText(60)).toBe('1 tim');
		expect(minutesText(78)).toBe('1 tim 18 min');
		expect(minutesText(140)).toBe('2 tim 20 min');
		expect(minutesText(444)).toBe('7 tim 24 min');
	});

	// Rounded once, on the total: 119.6 is 2 hours, not "1 tim 60 min".
	it('rounds the whole before splitting it', () => {
		expect(minutesText(119.6)).toBe('2 tim');
		expect(minutesText(59.6)).toBe('1 tim');
	});

	// A month of away time, say: minutes stop mattering.
	it('counts days and hours past a day', () => {
		expect(minutesText(1440)).toBe('1 d');
		expect(minutesText(1680)).toBe('1 d 4 tim');
		expect(minutesText(3 * 1440 + 59)).toBe('3 d');
	});
});

describe('countdownText', () => {
	const MIN = 60_000;

	it('counts down to the minute under a day', () => {
		expect(countdownText(78 * MIN)).toBe('1 tim 18 min');
		expect(countdownText(45 * MIN)).toBe('45 min');
	});

	// The badge that prompted this said "om 2 timmar" with 1 h 18 min left.
	it('never rounds an hour and a bit up to the next hour', () => {
		expect(countdownText(90 * MIN)).toBe('1 tim 30 min');
		expect(countdownText(119 * MIN)).toBe('1 tim 59 min');
	});

	it('holds "1 min" until the moment itself', () => {
		expect(countdownText(1_000)).toBe('1 min');
		expect(countdownText(60.5 * MIN)).toBe('1 tim 1 min');
	});

	it('counts how far past from the moment', () => {
		expect(countdownText(-1_000)).toBe('1 min');
		expect(countdownText(-65.9 * MIN)).toBe('1 tim 5 min');
	});

	it('names days and weeks from a day on', () => {
		expect(countdownText(3 * 86_400_000)).toBe('3 dagar');
		expect(countdownText(-21 * 86_400_000)).toBe('3 veckor');
	});
});
