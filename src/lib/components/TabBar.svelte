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
		label
	}: {
		tabs: Tab<T>[];
		current: T;
		/** The URL each tab links to — the page decides which param it sets. */
		href: (value: T) => string;
		/** Accessible name for the group, e.g. "Periodval". */
		label: string;
	} = $props();
</script>

<!-- Links rather than buttons: the selected period lives in the URL, so it
     survives a reload and a back button. -->
<nav
	class="flex rounded-lg bg-gray-100 p-1"
	aria-label={label}
>
	{#each tabs as tab (tab.value)}
		<a
			href={href(tab.value)}
			data-sveltekit-noscroll
			aria-current={current === tab.value ? 'true' : undefined}
			class="flex-1 rounded-md py-1.5 text-center text-sm font-medium {current === tab.value
				? 'bg-white text-gray-900 shadow-sm'
				: 'text-gray-500 hover:text-gray-900'}"
		>
			{tab.label}
		</a>
	{/each}
</nav>
