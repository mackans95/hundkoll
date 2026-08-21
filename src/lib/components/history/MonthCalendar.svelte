<script lang="ts">
	import { ICON_LIMIT, type DaySummary } from '$lib/history';
	import * as format from '$lib/format';
	import * as locale from '$lib/locale';

	let {
		days,
		summaries,
		selected,
		today,
		dayHref
	}: {
		/** Month days with the blanks that align them, from time.calendarDays. */
		days: (string | null)[];
		summaries: Record<string, DaySummary>;
		selected: string | null;
		today: string;
		dayHref: (day: string) => string;
	} = $props();
</script>

<div
	role="grid"
	aria-label={locale.history.title}
	class="flex flex-col gap-1"
>
	<div
		role="row"
		class="grid grid-cols-7 gap-1"
	>
		{#each locale.history.weekdays as weekday (weekday)}
			<span
				role="columnheader"
				class="py-1 text-center text-xs font-medium text-ink-faint">{weekday}</span
			>
		{/each}
	</div>

	<!-- Selection lives in the URL, like the stats period pickers, so back and
	     reload behave. noscroll: the grid must not jump under the thumb. -->
	<div class="grid grid-cols-7 gap-1">
		{#each days as day, cell (day ?? `blank-${cell}`)}
			{#if day === null}
				<span></span>
			{:else}
				{@const summary = summaries[day]}
				{@const future = day > today}
				<a
					href={dayHref(day)}
					data-sveltekit-noscroll
					aria-label={locale.history.dayLabel(format.dayHeading(day), summary?.count ?? 0)}
					aria-current={day === selected ? 'true' : undefined}
					class="flex min-h-14 flex-col items-center gap-0.5 rounded-lg border py-1 text-xs transition-colors {day ===
					selected
						? 'border-transparent bg-selected font-semibold text-ink'
						: day === today
							? 'border-edge-strong hover:bg-surface-hover-soft'
							: 'border-transparent hover:bg-surface-hover-soft'} {future ? 'text-ink-faint' : ''}"
				>
					<span>{Number(day.slice(8))}</span>
					{#if summary}
						<span
							class="flex flex-wrap justify-center gap-px leading-none"
							aria-hidden="true"
						>
							{#each summary.icons as icon, index (index)}<span>{icon}</span>{/each}
						</span>
						{#if summary.count > ICON_LIMIT}
							<span
								class="text-[0.625rem] text-ink-muted"
								aria-hidden="true">{locale.history.more(summary.count - ICON_LIMIT)}</span
							>
						{/if}
					{/if}
				</a>
			{/if}
		{/each}
	</div>
</div>
