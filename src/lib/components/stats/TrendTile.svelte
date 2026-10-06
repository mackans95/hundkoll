<script lang="ts">
	import * as locale from '$lib/locale';
	import type { TrendRow, TrendTone } from '$lib/stats/trends';

	let { row }: { row: TrendRow } = $props();

	const words = locale.stats.trends;
	// Status's badge colours, and a mark beside them so better and worse never rest on hue.
	const BADGE: Record<TrendTone, string> = {
		better: 'bg-success-badge text-success-ink',
		worse: 'bg-warn-badge text-warn-ink',
		neutral: 'bg-surface-hover text-ink-label'
	};
</script>

<li class="flex items-center gap-3 rounded-2xl border border-edge bg-surface-raised px-4 py-3">
	<div class="flex min-w-0 flex-1 flex-col">
		<span class="font-medium">{row.label}</span>
		<span class="mt-1 text-2xl font-bold">{row.to}</span>
		<span class="text-sm text-ink-muted">{words.from(row.from)}</span>
	</div>
	<span class="shrink-0 rounded-full px-3 py-1 text-sm font-semibold {BADGE[row.tone]}">
		{row.badge}
		{#if row.tone !== 'neutral'}
			<span aria-hidden="true">{words.mark[row.tone]}</span>
			<span class="sr-only">{words.toneName[row.tone]}</span>
		{/if}
	</span>
</li>
