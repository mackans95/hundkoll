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

{#snippet badge(text: string, tone: TrendTone, size: string)}
	<span class="shrink-0 rounded-full font-semibold {size} {BADGE[tone]}">
		{text}
		{#if tone !== 'neutral'}
			<span aria-hidden="true">{words.mark[tone]}</span>
			<span class="sr-only">{words.toneName[tone]}</span>
		{/if}
	</span>
{/snippet}

<li class="flex flex-col gap-2 rounded-2xl border border-edge bg-surface-raised px-4 py-2.5">
	<div class="flex items-center gap-3">
		<div class="flex min-w-0 flex-1 flex-col">
			<span class="font-medium">{row.label}</span>
			<span class="flex flex-wrap items-baseline gap-x-2">
				<span class="text-2xl font-bold">{row.to}</span>
				<span class="text-sm text-ink-muted"
					><span aria-hidden="true">·</span> {words.from(row.from)}</span
				>
			</span>
			{#if row.away}
				<span class="text-xs text-ink-muted">
					{row.away === 'home' ? words.awayHome : words.awayShort}
				</span>
			{/if}
		</div>
		{@render badge(row.badge, row.tone, 'px-3 py-1 text-sm')}
	</div>
	<!-- What the row's field revealed, compared the same way, one line each. -->
	{#if row.children.length > 0}
		<ul class="flex flex-col gap-1 border-l-2 border-edge pl-3">
			{#each row.children as child (child.key)}
				<li class="flex items-center gap-2 text-sm">
					<span class="min-w-0 flex-1">{child.label}</span>
					<span class="text-ink-muted"
						>{child.from} → <span class="font-semibold text-ink">{child.to}</span></span
					>
					{@render badge(child.badge, child.tone, 'px-2 py-0.5 text-xs')}
				</li>
			{/each}
		</ul>
	{/if}
</li>
