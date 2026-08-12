<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';

	let { children, data }: { children: Snippet; data: LayoutData } = $props();

	const tabs = [
		{ href: '/', label: 'Logga', icon: '🐾' },
		{ href: '/status', label: 'Status', icon: '⏱️' },
		{ href: '/settings', label: 'Inställningar', icon: '⚙️' }
	];
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

{#if data.session}
	<div class="pb-20">
		{@render children()}
	</div>
	<nav
		class="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)]"
	>
		<div class="mx-auto flex max-w-sm">
			{#each tabs as tab (tab.href)}
				<a
					href={tab.href}
					aria-current={page.url.pathname === tab.href ? 'page' : undefined}
					class="flex flex-1 flex-col items-center gap-0.5 py-2 text-xs {page.url.pathname ===
					tab.href
						? 'font-semibold text-gray-900'
						: 'text-gray-500'}"
				>
					<span class="text-xl" aria-hidden="true">{tab.icon}</span>
					{tab.label}
				</a>
			{/each}
		</div>
	</nav>
{:else}
	{@render children()}
{/if}
