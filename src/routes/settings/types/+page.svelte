<script lang="ts">
	import { resolve } from '$app/paths';
	import * as format from '$lib/format';
	import * as locale from '$lib/locale';
	import { chartColor } from '$lib/stats/palette';
	import { isDaily } from '$lib/status/schedule';
	import SettingsPage from '$lib/components/settings/SettingsPage.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// The same two groups, in the same order, as on Status.
	const groups = $derived([
		{ heading: locale.status.dailyHeading, types: data.types.filter(isDaily) },
		{ heading: locale.status.intervalHeading, types: data.types.filter((type) => !isDaily(type)) }
	]);
</script>

<SettingsPage title={locale.settings.pages.types}>
	{#if data.failed}
		<p class="rounded-lg bg-danger-surface p-4 text-danger-ink">{locale.settings.loadFailed}</p>
	{/if}

	<p class="px-1 text-sm text-ink-muted">{locale.settings.typesHelp}</p>

	{#each groups as group (group.heading)}
		<section class="flex flex-col gap-2">
			<h3 class="px-1 text-sm font-semibold tracking-wide text-ink-muted uppercase">
				{group.heading}
			</h3>
			{#each group.types as type (type.id)}
				<a
					href={resolve('/settings/types/[id]', { id: type.id })}
					class="flex items-center gap-3 rounded-2xl border border-edge bg-surface-raised px-4 py-3 hover:bg-surface-hover"
				>
					<span class="font-medium">{type.icon} {type.label}</span>
					<span class="ml-auto text-sm text-ink-muted">
						{type.settings.showOnStatus
							? format.intervalSetting(type)
							: locale.settings.type.hiddenOnStatus}
					</span>
					<!-- Drawn empty for a type with no chart, so the column stays aligned. -->
					<span
						class="size-3 shrink-0 rounded-full"
						style:background={type.settings.chartColor
							? chartColor(type.settings.chartColor).main
							: undefined}
						aria-hidden="true"
					></span>
					<span
						class="text-ink-muted"
						aria-hidden="true">›</span
					>
				</a>
			{/each}
		</section>
	{/each}
</SettingsPage>
