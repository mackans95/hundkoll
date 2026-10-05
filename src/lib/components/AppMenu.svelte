<script lang="ts">
	import { onMount } from 'svelte';
	import { goto, pushState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import * as locale from '$lib/locale';
	import { isNativeApp } from '$lib/native';

	let nativeApp = $state(false);
	onMount(() => {
		nativeApp = isNativeApp();
	});

	const pages = $derived([
		{ href: resolve('/settings/types'), label: locale.settings.pages.types, icon: '🗂️' },
		{ href: resolve('/settings/appearance'), label: locale.settings.pages.appearance, icon: '🎨' },
		...(nativeApp
			? [
					{
						href: resolve('/settings/notifications'),
						label: locale.settings.pages.notifications,
						icon: '🔔'
					}
				]
			: []),
		{ href: resolve('/settings/tables'), label: locale.settings.pages.tables, icon: '📋' },
		{ href: resolve('/settings/trends'), label: locale.settings.pages.trends, icon: '📈' }
	]);

	// Open is a history entry, so the Back gesture closes the menu. Without
	// JS the <details> still toggles by itself.
	const open = $derived(page.state.menuOpen === true);
	const inSettings = $derived(page.url.pathname.startsWith(resolve('/settings')));

	function ontoggle(event: Event & { currentTarget: HTMLDetailsElement }) {
		const opened = event.currentTarget.open;
		if (opened && !open) pushState('', { menuOpen: true });
		else if (!opened && open) history.back();
	}

	function close() {
		if (open) history.back();
	}

	// Pops the menu's entry before going, so Back from the page returns to the
	// one the menu opened on. Replacing the entry instead keeps its navigation
	// index, and SvelteKit then treats that Back as shallow and loads nothing.
	async function follow(event: MouseEvent & { currentTarget: HTMLAnchorElement }) {
		if (!open || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
		event.preventDefault();
		const href = event.currentTarget.pathname;
		const popped = new Promise((done) => addEventListener('popstate', done, { once: true }));
		history.back();
		await popped;
		await goto(href);
	}

	function keydown(event: KeyboardEvent) {
		if (event.key === 'Escape') close();
	}
</script>

<svelte:window onkeydown={keydown} />

<details
	{open}
	{ontoggle}
	class="absolute top-4 right-3 z-30"
>
	<summary
		aria-label={locale.nav.menu}
		class="relative z-10 flex h-9 w-11 cursor-pointer list-none items-center justify-center rounded-lg text-2xl transition-colors [&::-webkit-details-marker]:hidden {open ||
		inSettings
			? 'bg-selected text-ink'
			: 'text-ink-muted hover:bg-surface-hover-soft hover:text-ink active:bg-surface-hover'}"
	>
		<span aria-hidden="true">☰</span>
	</summary>

	<!-- A tap outside closes, and is caught here rather than landing on a tab. -->
	<div
		role="presentation"
		onclick={close}
		class="fixed inset-0"
	></div>

	<nav
		aria-label={locale.nav.menu}
		class="absolute top-full right-0 mt-2 flex w-60 flex-col rounded-2xl border border-edge bg-surface-raised p-2 shadow-xl"
	>
		<h2 class="px-3 pt-1 pb-2 text-sm font-semibold tracking-wide text-ink-muted uppercase">
			{locale.settings.title}
		</h2>
		{#each pages as entry (entry.href)}
			{@const current = page.url.pathname === entry.href}
			<a
				href={entry.href}
				onclick={follow}
				aria-current={current ? 'page' : undefined}
				class="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors {current
					? 'bg-selected font-semibold text-ink'
					: 'text-ink-label hover:bg-surface-hover-soft active:bg-surface-hover'}"
			>
				<span aria-hidden="true">{entry.icon}</span>
				{entry.label}
			</a>
		{/each}
		<form
			method="POST"
			action={resolve('/logout')}
			class="mt-2 border-t border-edge-soft pt-2"
		>
			<button
				type="submit"
				class="w-full rounded-lg px-3 py-2.5 text-left text-ink-label transition-colors hover:bg-surface-hover-soft active:bg-surface-hover"
			>
				{locale.settings.logout}
			</button>
		</form>
	</nav>
</details>
