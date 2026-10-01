<script lang="ts">
	import { onMount } from 'svelte';
	import * as locale from '$lib/locale';
	import { disablePush, enablePush, pushWanted } from '$lib/native';

	type State = 'off' | 'on' | 'working' | 'denied' | 'failed';
	let current = $state<State>('off');

	// localStorage only exists after mount; the server renders the switch off.
	onMount(() => {
		current = pushWanted() ? 'on' : 'off';
	});

	async function toggle() {
		if (current === 'working') return;
		const wasOn = current === 'on';
		current = 'working';
		try {
			if (wasOn) {
				await disablePush();
				current = 'off';
			} else {
				current = await enablePush();
			}
		} catch (e) {
			console.error('push switch failed:', e);
			current = wasOn ? 'on' : 'failed';
		}
	}
</script>

<section class="flex flex-col gap-2">
	<h2 class="px-1 text-sm font-semibold tracking-wide text-ink-muted uppercase">
		{locale.settings.push.heading}
	</h2>
	<button
		type="button"
		role="switch"
		aria-checked={current === 'on'}
		aria-busy={current === 'working'}
		onclick={toggle}
		class="flex items-center justify-between gap-3 rounded-2xl border border-edge bg-surface-raised px-4 py-3 text-left"
	>
		<span class="font-medium">{locale.settings.push.toggle}</span>
		<span
			class="relative h-6 w-11 shrink-0 rounded-full transition-colors {current === 'on'
				? 'bg-emerald-600'
				: 'bg-edge-strong'}"
			aria-hidden="true"
		>
			<span
				class="absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform {current ===
				'on'
					? 'translate-x-5'
					: ''}"
			></span>
		</span>
	</button>
	{#if current === 'denied'}
		<p class="rounded-lg bg-warn-surface p-4 text-sm text-warn-ink">
			{locale.settings.push.denied}
		</p>
	{:else if current === 'failed'}
		<p class="rounded-lg bg-danger-surface p-4 text-sm text-danger-ink">
			{locale.settings.push.failed}
		</p>
	{:else}
		<p class="px-1 text-sm text-ink-muted">{locale.settings.push.help}</p>
	{/if}
</section>
