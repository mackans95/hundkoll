// Statistik's cards as stored and as Settings → Tabeller edits them (plan 28).

import { describe, expect, it } from 'vitest';
import {
	cardHeading,
	defaultCards,
	parseCards,
	planCardList,
	setCardShown
} from '$lib/stats/cardConfig';
import * as locale from '$lib/locale';

const types = (rows: { type: string }[]) => rows.map((row) => row.type);

const submit = (cards: string[], shown: string[], op = '') => {
	const form = new FormData();
	for (const card of cards) form.append('card', card);
	for (const card of shown) form.append('shown', card);
	if (op) form.set('op', op);
	return form;
};

const ALL = ['walk', 'meal', 'accident', 'weight', 'alone', 'car_ride'];

describe('defaultCards', () => {
	it('is today’s page, in today’s order, all shown', () => {
		expect(types(defaultCards())).toEqual(ALL);
		expect(defaultCards().every((card) => card.shown)).toBe(true);
	});
});

describe('parseCards', () => {
	it('keeps the stored order and what it hides', () => {
		const stored = [...ALL].reverse().map((type) => ({ type, shown: type !== 'weight' }));
		expect(parseCards(stored)).toEqual(stored);
	});

	it('drops a type without a card, and a duplicate', () => {
		const stored = [
			{ type: 'bath', shown: true },
			...defaultCards(),
			{ type: 'walk', shown: false }
		];
		expect(parseCards(stored)).toEqual(defaultCards());
	});

	it('appends a card the list doesn’t name yet, shown, as a generated one does', () => {
		const stored = defaultCards().filter((card) => card.type !== 'car_ride');
		expect(parseCards(stored).at(-1)).toEqual({ type: 'car_ride', shown: true });
	});

	it('reads anything but a list as the defaults', () => {
		expect(parseCards({ cards: [] })).toEqual(defaultCards());
	});
});

describe('planCardList', () => {
	it('takes the posted order and the ticked boxes', () => {
		const order = ['meal', 'walk', 'accident', 'weight', 'alone', 'car_ride'];
		const rows = planCardList(submit(order, ['meal', 'accident']));
		expect(types(rows)).toEqual(order);
		expect(rows.filter((row) => row.shown).map((row) => row.type)).toEqual(['meal', 'accident']);
	});

	it('applies one move, and none past either end', () => {
		expect(types(planCardList(submit(ALL, ALL, 'down:0')))[1]).toBe('walk');
		expect(types(planCardList(submit(ALL, ALL, 'up:0')))).toEqual(ALL);
		expect(types(planCardList(submit(ALL, ALL, 'down:5')))).toEqual(ALL);
	});
});

describe('setCardShown', () => {
	it('switches one card and leaves the order', () => {
		const next = setCardShown(defaultCards(), 'accident', false);
		expect(types(next)).toEqual(ALL);
		expect(next.find((card) => card.type === 'accident')?.shown).toBe(false);
	});
});

describe('cardHeading', () => {
	it('names a card as Statistik does, generated ones from their own locale block', () => {
		expect(cardHeading('meal')).toBe(locale.stats.meals.heading);
		expect(cardHeading('car_ride')).toBe(locale.stats.carRide.heading);
		expect(cardHeading('alone')).toBe(locale.stats.alone.heading);
	});
});
