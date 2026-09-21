<script lang="ts">
	import * as locale from '$lib/locale';
	import type { EventType } from '$lib/types/domain';

	let { kind, types }: { kind: 'daily' | 'recurring'; types: EventType[] } = $props();

	const look = $derived(
		kind === 'daily'
			? {
					heading: locale.status.dailyHeading,
					unit: locale.settings.hours,
					row: 'flex-col gap-2',
					width: 'w-16'
				}
			: {
					heading: locale.status.intervalHeading,
					unit: locale.settings.days,
					row: 'items-center justify-between gap-3',
					width: 'w-20'
				}
	);
</script>

<h3 class="px-1 pt-1 text-sm font-semibold tracking-wide text-ink-muted uppercase">
	{look.heading}
</h3>

{#each types as type (type.id)}
	<div class="{look.row} flex rounded-2xl border border-edge bg-surface-raised px-4 py-3">
		<span class="font-medium">{type.icon} {type.label}</span>
		<span class="flex items-center gap-2">
			{#if kind === 'daily'}
				<select
					name="mode_{type.id}"
					aria-label={type.label}
					class="min-w-0 flex-1 rounded-lg border-edge-strong text-sm"
				>
					<option
						value="hours"
						selected={type.interval_type === 'hours'}>{locale.settings.modeHours}</option
					>
					<option
						value="average"
						selected={type.interval_type === 'average'}>{locale.settings.modeAverage}</option
					>
				</select>
			{/if}
			<input
				type="number"
				name="interval_{type.id}"
				aria-label={type.label}
				value={type.interval ?? ''}
				min="1"
				inputmode="numeric"
				class="{look.width} rounded-lg border-edge-strong text-right"
			/>
			<span class="text-sm text-ink-muted">{look.unit}</span>
		</span>
	</div>
{/each}
