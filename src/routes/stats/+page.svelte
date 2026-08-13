<script lang="ts">
	import Columns, { type ColumnBucket } from '$lib/charts/Columns.svelte';
	import TrendLine from '$lib/charts/TrendLine.svelte';
	import { minutesText, pctText, svNum } from '$lib/format';
	import { stockholmNowForInput } from '$lib/time';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const WALK_COLOR = '#059669';
	const WEIGHT_COLOR = '#0284c7';
	// Validated categorical pair (kiss, bajs) + neutral for unspecified.
	const ACCIDENT_COLORS = ['#d97706', '#92400e', '#9ca3af'];
	// Emphasis pair: finished carries the story, not-finished is context.
	const MEAL_COLORS = ['#059669', '#9ca3af', '#d1d5db'];

	const today = stockholmNowForInput().slice(0, 10);

	function dateAdd(iso: string, days: number): string {
		const d = new Date(`${iso}T00:00:00Z`);
		d.setUTCDate(d.getUTCDate() + days);
		return d.toISOString().slice(0, 10);
	}
	function monthAdd(iso: string, months: number): string {
		const d = new Date(`${iso.slice(0, 7)}-01T00:00:00Z`);
		d.setUTCMonth(d.getUTCMonth() + months);
		return d.toISOString().slice(0, 10);
	}
	function dayLabel(iso: string): string {
		const d = new Date(`${iso}T00:00:00Z`);
		return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
	}
	const monthFormat = new Intl.DateTimeFormat('sv-SE', { month: 'short', timeZone: 'UTC' });
	function monthLabel(iso: string): string {
		return monthFormat.format(new Date(`${iso}T00:00:00Z`));
	}
	/** ISO 8601 week number — the Swedish convention. */
	function isoWeek(iso: string): number {
		const d = new Date(`${iso}T00:00:00Z`);
		d.setUTCDate(d.getUTCDate() + 4 - (((d.getUTCDay() + 6) % 7) + 1));
		const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
		return Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
	}

	function last30Days(): string[] {
		const out: string[] = [];
		for (let i = 29; i >= 0; i--) out.push(dateAdd(today, -i));
		return out;
	}

	// Zero-filled 30-day walk buckets; tooltip carries the day's kiss/bajs
	// counts and its own gap/duration averages.
	const walkBuckets: ColumnBucket[] = $derived.by(() => {
		const byDay = new Map(data.walkDays.map((w) => [w.day, w]));
		return last30Days().map((day, i) => {
			const row = byDay.get(day);
			const n = row?.n ?? 0;
			return {
				label: dayLabel(day),
				tick: i % 7 === 0,
				segments: [n],
				tooltip: {
					heading: dayLabel(day),
					rows:
						n === 0
							? [[{ label: 'Promenader', value: '0', color: WALK_COLOR }]]
							: [
									[
										{ label: '🚶', value: String(n), big: true },
										{ label: '🟡', value: String(row?.pee ?? 0), big: true },
										{ label: '💩', value: String(row?.poop ?? 0), big: true }
									],
									[
										{
											label: 'Tid mellan',
											value: row?.avg_gap_min != null ? `~${minutesText(row.avg_gap_min)}` : '–'
										},
										{
											label: 'Längd',
											value:
												row?.avg_duration_min != null
													? `~${minutesText(row.avg_duration_min)}`
													: '–'
										}
									]
								]
				}
			};
		});
	});

	// Meals per day, split by finished/not; tooltip carries the day's share.
	const mealBuckets: ColumnBucket[] = $derived.by(() => {
		const byDay = new Map(data.mealDays.map((m) => [m.day, m]));
		return last30Days().map((day, i) => {
			const row = byDay.get(day);
			const finished = row?.finished_true ?? 0;
			const notFinished = row?.finished_false ?? 0;
			const unknown = Math.max(0, (row?.n ?? 0) - finished - notFinished);
			const judged = finished + notFinished;
			return {
				label: dayLabel(day),
				tick: i % 7 === 0,
				segments: [finished, notFinished, unknown],
				tooltip: {
					heading: dayLabel(day),
					rows:
						(row?.n ?? 0) === 0
							? [[{ label: 'Mål', value: '0', color: MEAL_COLORS[0] }]]
							: [
									[
										{ label: '✅', value: String(finished), big: true },
										{ label: '❌', value: String(notFinished), big: true },
										...(unknown > 0 ? [{ label: '❔', value: String(unknown), big: true }] : [])
									],
									[
										...(judged > 0 ? [{ label: 'Andel', value: pctText(finished / judged) }] : []),
										{
											label: 'Tid mellan',
											value: row?.avg_gap_min != null ? `~${minutesText(row.avg_gap_min)}` : '–'
										}
									]
								]
				}
			};
		});
	});
	const hasUnknownMeals = $derived(mealBuckets.some((b) => b.segments[2] > 0));

	// Zero-filled accident buckets for the selected period.
	const accidentBuckets: ColumnBucket[] = $derived.by(() => {
		const byBucket = new Map(data.accidentBins.map((b) => [b.bucket, b]));
		const starts: string[] = [];
		if (data.period === 'day') {
			for (let i = 29; i >= 0; i--) starts.push(dateAdd(today, -i));
		} else if (data.period === 'week') {
			const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
			const monday = dateAdd(today, -((dow + 6) % 7));
			for (let i = 11; i >= 0; i--) starts.push(dateAdd(monday, -7 * i));
		} else {
			for (let i = 11; i >= 0; i--) starts.push(monthAdd(today, -i));
		}
		const every = data.period === 'day' ? 7 : 3;
		const labels: Record<typeof data.period, (s: string) => string> = {
			day: dayLabel,
			week: (s) => `v.${isoWeek(s)}`,
			month: monthLabel
		};
		const headings: Record<typeof data.period, (s: string) => string> = {
			day: dayLabel,
			week: (s) => `Vecka ${isoWeek(s)}`,
			month: monthLabel
		};
		return starts.map((start, i) => {
			const bin = byBucket.get(start);
			const pee = bin?.pee ?? 0;
			const poop = bin?.poop ?? 0;
			const other = Math.max(0, (bin?.n ?? 0) - pee - poop);
			return {
				label: labels[data.period](start),
				tick: i % every === 0,
				segments: [pee, poop, other],
				tooltip: {
					heading: headings[data.period](start),
					rows: [
						[
							{ label: '🟡', value: String(pee), big: true },
							{ label: '💩', value: String(poop), big: true },
							...(other > 0 ? [{ label: '❔', value: String(other), big: true }] : [])
						]
					]
				}
			};
		});
	});
	const hasUnspecified = $derived(accidentBuckets.some((b) => b.segments[2] > 0));

	const weightPoints = $derived(
		data.weights.map((w) => ({
			t: new Date(w.occurred_at).getTime(),
			label: dayLabel(w.occurred_at.slice(0, 10)),
			value: w.kg
		}))
	);

	const s = $derived(data.summary);
	// Per-week/month numbers and charts stay hidden until a full week or
	// month has actually been tracked — no extrapolated pace.
	const tracked = $derived(s?.days_counted ?? 0);
	const periodReady = $derived(
		data.period === 'day' || (data.period === 'week' ? tracked >= 7 : tracked >= 30)
	);

	const accidentTiles = $derived([
		{ label: 'per dag', value: s?.accidents_per_day != null ? svNum(s.accidents_per_day) : '–' },
		{
			label: 'per vecka',
			value: s?.accidents_per_week != null && tracked >= 7 ? svNum(s.accidents_per_week) : '–'
		},
		{
			label: 'per månad',
			value: s?.accidents_per_month != null && tracked >= 30 ? svNum(s.accidents_per_month) : '–'
		}
	]);

	const periodTabs: { value: typeof data.period; label: string }[] = [
		{ value: 'day', label: 'Dag' },
		{ value: 'week', label: 'Vecka' },
		{ value: 'month', label: 'Månad' }
	];
</script>

{#snippet miniTile(value: string, label: string)}
	<div class="flex flex-col gap-1 rounded-lg border border-gray-300 bg-gray-50 p-2 text-center">
		<p class="text-xs text-gray-500">{label}</p>
		<p class="my-auto text-lg font-bold">{value}</p>
	</div>
{/snippet}

{#snippet legendDot(color: string, label: string)}
	<span class="flex items-center gap-1.5">
		<span class="h-2.5 w-2.5 rounded-full" style="background:{color}"></span>
		{label}
	</span>
{/snippet}

<svelte:head><title>Statistik – Hundkoll</title></svelte:head>

<main class="mx-auto flex min-h-dvh max-w-sm flex-col gap-6 p-4">
	<header class="px-1">
		<h1 class="text-3xl font-bold">Statistik</h1>
		<p class="mt-1 text-sm text-gray-500">
			Snitt över de senaste {tracked || 30} dagarna.
		</p>
	</header>

	<section class="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4">
		<h2 class="font-semibold">🚶 Promenader</h2>
		<Columns buckets={walkBuckets} colors={[WALK_COLOR]} />
		<div class="flex flex-col gap-2">
			{@render miniTile(s?.walks_per_day != null ? svNum(s.walks_per_day) : '–', '🚶 per dag')}
			<div class="grid grid-cols-2 gap-2">
				{@render miniTile(
					s?.avg_walk_gap_min != null ? `~${minutesText(s.avg_walk_gap_min)}` : '–',
					'⏳ mellan promenader'
				)}
				{@render miniTile(
					s?.avg_walk_duration_min != null ? `~${minutesText(s.avg_walk_duration_min)}` : '–',
					'⏱️ snittlängd'
				)}
			</div>
		</div>
	</section>

	<section class="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4">
		<h2 class="font-semibold">🍽️ Mat</h2>
		<Columns buckets={mealBuckets} colors={MEAL_COLORS} />
		<div class="flex gap-4 text-sm text-gray-600">
			{@render legendDot(MEAL_COLORS[0], 'Åt upp')}
			{@render legendDot(MEAL_COLORS[1], 'Åt inte upp')}
			{#if hasUnknownMeals}
				{@render legendDot(MEAL_COLORS[2], 'Okänt')}
			{/if}
		</div>
		<div class="grid grid-cols-2 gap-2">
			{@render miniTile(
				s?.avg_meal_gap_min != null ? `~${minutesText(s.avg_meal_gap_min)}` : '–',
				'⏳ mellan mål'
			)}
			{@render miniTile(
				s?.meal_finish_rate != null ? pctText(s.meal_finish_rate) : '–',
				'✅ åt upp'
			)}
		</div>
	</section>

	<section class="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4">
		<h2 class="font-semibold">⚠️ Olyckor</h2>
		<nav class="flex rounded-lg bg-gray-100 p-1" aria-label="Periodval">
			{#each periodTabs as tab (tab.value)}
				<a
					href="?period={tab.value}"
					data-sveltekit-noscroll
					aria-current={data.period === tab.value ? 'true' : undefined}
					class="flex-1 rounded-md py-1.5 text-center text-sm font-medium {data.period === tab.value
						? 'bg-white text-gray-900 shadow-sm'
						: 'text-gray-500 hover:text-gray-900'}"
				>
					{tab.label}
				</a>
			{/each}
		</nav>
		{#if periodReady}
			<Columns buckets={accidentBuckets} colors={ACCIDENT_COLORS} />
			<div class="flex gap-4 text-sm text-gray-600">
				{@render legendDot(ACCIDENT_COLORS[0], 'Kiss')}
				{@render legendDot(ACCIDENT_COLORS[1], 'Bajs')}
				{#if hasUnspecified}
					{@render legendDot(ACCIDENT_COLORS[2], 'Ospecificerat')}
				{/if}
			</div>
		{:else}
			<p class="py-6 text-center text-sm text-gray-500">
				{data.period === 'week'
					? 'Veckovyn visas när en hel vecka har spårats.'
					: 'Månadsvyn visas när en hel månad har spårats.'}
			</p>
		{/if}
		<div class="grid grid-cols-3 gap-2">
			{#each accidentTiles as tile (tile.label)}
				{@render miniTile(tile.value, tile.label)}
			{/each}
		</div>
	</section>

	<section class="flex flex-col gap-2 rounded-2xl border border-gray-200 bg-white p-4">
		<div class="flex items-baseline justify-between">
			<h2 class="font-semibold">⚖️ Vikt</h2>
			{#if data.weights.length > 0}
				<p class="text-lg font-bold">{svNum(data.weights[data.weights.length - 1].kg)} kg</p>
			{/if}
		</div>
		{#if weightPoints.length === 0}
			<p class="text-sm text-gray-500">Ingen vägning loggad ännu.</p>
		{:else}
			<TrendLine points={weightPoints} color={WEIGHT_COLOR} unit="kg" />
		{/if}
	</section>
</main>
