<script
	lang="ts"
	module
>
	export type Tab<T extends string> = { value: T; label: string };
</script>

<script
	lang="ts"
	generics="T extends string"
>
	let {
		tabs,
		current,
		href,
		label,
		onpick
	}: {
		tabs: Tab<T>[];
		current: T;
		/** The URL each tab links to — the page decides which param it sets. */
		href: (value: T) => string;
		/** Accessible name for the group, e.g. "Periodval". */
		label: string;
		/** Switches in place instead of following the link; the link stays for no JS. */
		onpick?: (value: T) => void;
	} = $props();
</script>

<!-- Links rather than buttons: the selected period lives in the URL, so it
     survives a reload and a back button. -->
<nav
	class="flex rounded-lg bg-surface-hover p-1"
	aria-label={label}
>
	{#each tabs as tab (tab.value)}
		<a
			href={href(tab.value)}
			data-sveltekit-noscroll
			data-sveltekit-preload-data={onpick ? 'off' : undefined}
			onclick={onpick
				? (event) => {
						event.preventDefault();
						onpick(tab.value);
					}
				: undefined}
			aria-current={current === tab.value ? 'true' : undefined}
			class="flex-1 rounded-md py-1.5 text-center text-sm font-medium {current === tab.value
				? 'bg-surface-raised text-ink shadow-sm'
				: 'text-ink-muted hover:text-ink'}"
		>
			{tab.label}
		</a>
	{/each}
</nav>
