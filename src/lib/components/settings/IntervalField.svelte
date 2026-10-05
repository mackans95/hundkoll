<script lang="ts">
	import * as locale from '$lib/locale';
	import { isDaily } from '$lib/status/schedule';
	import type { EventType } from '$lib/types/domain';

	let { type }: { type: EventType } = $props();

	// Only a daily type may switch between a fixed number and the average.
	const daily = $derived(isDaily(type));
</script>

<div class="flex items-center gap-2 rounded-2xl border border-edge bg-surface-raised px-4 py-3">
	{#if daily}
		<select
			name="mode_{type.id}"
			aria-label={locale.settings.type.interval}
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
		aria-label={locale.settings.type.interval}
		value={type.interval ?? ''}
		min="1"
		inputmode="numeric"
		class="{daily ? 'w-16' : 'ml-auto w-20'} rounded-lg border-edge-strong text-right"
	/>
	<span class="text-sm text-ink-muted">{daily ? locale.settings.hours : locale.settings.days}</span>
</div>
