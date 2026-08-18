<script lang="ts">
	import './layout.css';
	import { navigating, page } from '$app/state';
	import { onMount } from 'svelte';
	import type { Snippet } from 'svelte';
	import * as locale from '$lib/locale';
	import { loadQueue } from '$lib/offline/queue.svelte';
	import { sendPending } from '$lib/offline/sync';
	import type { LayoutData } from './$types';

	let { children, data }: { children: Snippet; data: LayoutData } = $props();

	// Anything not yet stored is sent as soon as it can be — on launch here,
	// and the moment the connection comes back via <svelte:window> below.
	onMount(() => {
		loadQueue().then(sendPending);
	});

	// Where a tap is heading; null unless a navigation is in flight.
	const pending = $derived(navigating.to?.url.pathname ?? null);

	const tabs = [
		{ href: '/', label: locale.nav.log, icon: '🐾' },
		{ href: '/status', label: locale.nav.status, icon: '⏱️' },
		{ href: '/stats', label: locale.nav.stats, icon: '📊' },
		{ href: '/settings', label: locale.nav.settings, icon: '⚙️' }
	];
</script>

<svelte:window ononline={sendPending} />

{#if data.session}
	<!-- Clears the fixed nav, which now grows by the home-indicator inset. -->
	<div class="pb-[calc(5rem+env(safe-area-inset-bottom))]">
		{@render children()}
	</div>
	<nav
		class="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)]"
	>
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
					class="flex flex-1 flex-col items-center gap-0.5 py-2 text-xs transition-colors {selected
						? 'bg-emerald-100 font-semibold text-gray-900'
						: 'text-gray-500 hover:bg-gray-50 hover:text-gray-900 active:bg-gray-100'}"
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
