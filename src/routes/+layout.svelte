<script lang="ts">
	import './layout.css';
	import { navigating, page } from '$app/state';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import type { Snippet } from 'svelte';
	import * as locale from '$lib/locale';
	import { catchUp } from '$lib/offline/catchUp';
	import { loadQueue } from '$lib/offline/queue.svelte';
	import { loadTheme } from '$lib/theme.svelte';
	import type { LayoutData } from './$types';

	let { children, data }: { children: Snippet; data: LayoutData } = $props();

	// The theme attribute is already on <html> (app.html); loadTheme reads the
	// choice into state and lines up the theme-color metas. The queue has to be
	// read out of IndexedDB before catching up can send it.
	onMount(() => {
		loadTheme();
		loadQueue().then(catchUp);
	});

	// Where a tap is heading; null unless a navigation is in flight.
	const pending = $derived(navigating.to?.url.pathname ?? null);

	const tabs = [
		{ href: resolve('/'), label: locale.nav.log, icon: '🐾' },
		{ href: resolve('/status'), label: locale.nav.status, icon: '⏱️' },
		{ href: resolve('/stats'), label: locale.nav.stats, icon: '📊' },
		{ href: resolve('/settings'), label: locale.nav.settings, icon: '⚙️' }
	];
</script>

<!-- The ways back into the app: a launch (onMount above), the browser
     restoring the page, the app being brought to the front, and the
     connection returning. What any of them implies is catchUp's decision. -->
<svelte:window
	ononline={catchUp}
	onpageshow={catchUp}
/>
<svelte:document onvisibilitychange={catchUp} />

{#if data.session}
	<!-- Clears the fixed nav, which now grows by the home-indicator inset. -->
	<div class="pb-[calc(5rem+var(--nav-inset))]">
		{@render children()}
	</div>
	<!-- The safe-area padding lives inside each tab, not on the nav, so a
	     tab's own fill — the selected tint above all — reaches the physical
	     bottom edge instead of leaving a nav-colored band under the tabs. -->
	<nav class="fixed inset-x-0 bottom-0 z-20 border-t border-edge bg-surface-raised">
		<!-- relative: the bar sits on this row's top edge and spans exactly the
		     tabs. Absolute children of a flex container stay out of flow. -->
		<div class="relative mx-auto flex max-w-sm">
			<!-- Animates in after a delay, so a fast switch never flashes it. -->
			{#if navigating.to}
				<div
					class="loading-bar"
					role="presentation"
				></div>
			{/if}

			{#each tabs as tab (tab.href)}
				<!-- The target tab looks selected straight away; aria-current stays
				     on the screen actually showing. -->
				{@const selected = (pending ?? page.url.pathname) === tab.href}
				<!-- Preloads on touch: a free head start before the click. -->
				<a
					href={tab.href}
					data-sveltekit-preload-data="tap"
					aria-current={page.url.pathname === tab.href ? 'page' : undefined}
					aria-busy={pending === tab.href ? 'true' : undefined}
					class="flex flex-1 flex-col items-center gap-0.5 pt-2 pb-[calc(0.5rem+var(--nav-inset))] text-xs transition-colors {selected
						? 'bg-selected font-semibold text-ink'
						: 'text-ink-muted hover:bg-surface-hover-soft hover:text-ink active:bg-surface-hover'}"
				>
					<!-- active: is the only touchdown feedback; hover: needs a mouse. -->
					<span
						class="text-xl {pending === tab.href ? 'tab-loading' : ''}"
						aria-hidden="true">{tab.icon}</span
					>
					{tab.label}
				</a>
			{/each}
		</div>
	</nav>
{:else}
	{@render children()}
{/if}
