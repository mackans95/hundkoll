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

	// Zero-filled 30-day walk buckets (the view only returns days with events).
	const walkBuckets: ColumnBucket[] = $derived.by(() => {
		const byDay = new Map(data.walkDays.map((w) => [w.day, w.n]));
		const out: ColumnBucket[] = [];
		for (let i = 29; i >= 0; i--) {
			const day = dateAdd(today, -i);
			const n = byDay.get(day) ?? 0;
			out.push({
				label: dayLabel(day),
				tick: (29 - i) % 7 === 0,
				title: `${dayLabel(day)}: ${n} promenader`,
				segments: [n]
			});
		}
		return out;
	});

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
		const label = data.period === 'month' ? monthLabel : dayLabel;
		return starts.map((start, i) => {
			const bin = byBucket.get(start);
			const pee = bin?.pee ?? 0;
			const poop = bin?.poop ?? 0;
			const other = Math.max(0, (bin?.n ?? 0) - pee - poop);
			const parts = [`${pee} kiss`, `${poop} bajs`];
			if (other > 0) parts.push(`${other} ospecificerat`);
			return {
				label: label(start),
				tick: i % every === 0,
				title: `${label(start)}: ${parts.join(' · ')}`,
				segments: [pee, poop, other]
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
	const tiles = $derived([
		{ label: 'Promenader per dag', value: s?.walks_per_day != null ? svNum(s.walks_per_day) : '–' },
		{
			label: 'Mellan promenader',
			value: s?.avg_walk_gap_min != null ? minutesText(s.avg_walk_gap_min) : '–'
		},
		{
			label: 'Snittlängd promenad',
			value: s?.avg_walk_duration_min != null ? minutesText(s.avg_walk_duration_min) : '–'
		},
		{
			label: 'Mellan mål',
			value: s?.avg_meal_gap_min != null ? minutesText(s.avg_meal_gap_min) : '–'
		},
		{ label: 'Åt upp', value: s?.meal_finish_rate != null ? pctText(s.meal_finish_rate) : '–' }
	]);

	const accidentTiles = $derived([
		{ label: 'per dag', value: s?.accidents_per_day != null ? svNum(s.accidents_per_day) : '–' },
		{
			label: 'per vecka',
			value: s?.accidents_per_week != null ? svNum(s.accidents_per_week) : '–'
		},
		{
			label: 'per månad',
			value: s?.accidents_per_month != null ? svNum(s.accidents_per_month) : '–'
		}
	]);

	const periodTabs: { value: typeof data.period; label: string }[] = [
		{ value: 'day', label: 'Dag' },
		{ value: 'week', label: 'Vecka' },
		{ value: 'month', label: 'Månad' }
	];
</script>

<svelte:head><title>Statistik – Hundkoll</title></svelte:head>

<main class="mx-auto flex min-h-dvh max-w-sm flex-col gap-6 p-4">
	<header class="px-1">
		<h1 class="text-3xl font-bold">Statistik</h1>
		<p class="mt-1 text-sm text-gray-500">
			Snitt över de senaste {data.summary?.days_counted ?? 30} dagarna.
		</p>
	</header>

	<section class="grid grid-cols-2 gap-2">
		{#each tiles as tile (tile.label)}
			<div class="rounded-2xl border border-gray-200 bg-white p-4">
				<p class="text-2xl font-bold">{tile.value}</p>
				<p class="text-sm text-gray-500">{tile.label}</p>
			</div>
		{/each}
	</section>

	<section class="flex flex-col gap-2 rounded-2xl border border-gray-200 bg-white p-4">
		<h2 class="font-semibold">Promenader per dag</h2>
		<p class="text-sm text-gray-500">Senaste 30 dagarna</p>
		<Columns buckets={walkBuckets} colors={[WALK_COLOR]} />
	</section>

	<section class="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4">
		<h2 class="font-semibold">Olyckor</h2>
		<div class="grid grid-cols-3 gap-2">
			{#each accidentTiles as tile (tile.label)}
				<div class="rounded-xl bg-gray-50 p-2 text-center">
					<p class="text-lg font-bold">{tile.value}</p>
					<p class="text-xs text-gray-500">{tile.label}</p>
				</div>
			{/each}
		</div>
		<nav class="flex rounded-lg bg-gray-100 p-1" aria-label="Periodval">
			{#each periodTabs as tab (tab.value)}
				<a
					href="?period={tab.value}"
					data-sveltekit-noscroll
					aria-current={data.period === tab.value ? 'true' : undefined}
					class="flex-1 rounded-md py-1.5 text-center text-sm font-medium {data.period === tab.value
						? 'bg-white text-gray-900 shadow-sm'
						: 'text-gray-500'}"
				>
					{tab.label}
				</a>
			{/each}
		</nav>
		<Columns buckets={accidentBuckets} colors={ACCIDENT_COLORS} />
		<div class="flex gap-4 text-sm text-gray-600">
			<span class="flex items-center gap-1.5">
				<span class="h-2.5 w-2.5 rounded-full" style="background:{ACCIDENT_COLORS[0]}"></span>
				Kiss
			</span>
			<span class="flex items-center gap-1.5">
				<span class="h-2.5 w-2.5 rounded-full" style="background:{ACCIDENT_COLORS[1]}"></span>
				Bajs
			</span>
			{#if hasUnspecified}
				<span class="flex items-center gap-1.5">
					<span class="h-2.5 w-2.5 rounded-full" style="background:{ACCIDENT_COLORS[2]}"></span>
					Ospecificerat
				</span>
			{/if}
		</div>
	</section>

	<section class="flex flex-col gap-2 rounded-2xl border border-gray-200 bg-white p-4">
		<div class="flex items-baseline justify-between">
			<h2 class="font-semibold">Viktkurva</h2>
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
