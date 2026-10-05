<script lang="ts">
	import { onMount } from 'svelte';
	import * as locale from '$lib/locale';
	import {
		disableLockScreen,
		disablePush,
		enableLockScreen,
		enablePush,
		lockScreenWanted,
		pushWanted,
		type PushOutcome
	} from '$lib/native';

	type State = 'off' | 'on' | 'working' | 'denied' | 'failed';

	/** One switch: its state, and how it turns on and off. */
	function control(enable: () => Promise<PushOutcome>, disable: () => Promise<void>) {
		const self = $state({
			current: 'off' as State,
			async toggle() {
				if (self.current === 'working') return;
				const wasOn = self.current === 'on';
				self.current = 'working';
				try {
					if (wasOn) {
						await disable();
						self.current = 'off';
					} else {
						self.current = await enable();
					}
				} catch (e) {
					console.error('notification switch failed:', e);
					self.current = wasOn ? 'on' : 'failed';
				}
			}
		});
		return self;
	}

	const reminders = control(enablePush, disablePush);
	const lockScreen = control(enableLockScreen, disableLockScreen);

	// localStorage only exists after mount; the server renders both switches off.
	onMount(() => {
		reminders.current = pushWanted() ? 'on' : 'off';
		lockScreen.current = lockScreenWanted() ? 'on' : 'off';
	});
</script>

{#snippet row(label: string, help: string, failed: string, item: ReturnType<typeof control>)}
	<button
		type="button"
		role="switch"
		aria-checked={item.current === 'on'}
		aria-busy={item.current === 'working'}
		onclick={item.toggle}
		class="flex items-center justify-between gap-3 rounded-2xl border border-edge bg-surface-raised px-4 py-3 text-left"
	>
		<span class="font-medium">{label}</span>
		<span
			class="relative h-6 w-11 shrink-0 rounded-full transition-colors {item.current === 'on'
				? 'bg-emerald-600'
				: 'bg-edge-strong'}"
			aria-hidden="true"
		>
			<span
				class="absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform {item.current ===
				'on'
					? 'translate-x-5'
					: ''}"
			></span>
		</span>
	</button>
	{#if item.current === 'denied'}
		<p class="rounded-lg bg-warn-surface p-4 text-sm text-warn-ink">
			{locale.settings.push.denied}
		</p>
	{:else if item.current === 'failed'}
		<p class="rounded-lg bg-danger-surface p-4 text-sm text-danger-ink">{failed}</p>
	{:else}
		<p class="px-1 text-sm text-ink-muted">{help}</p>
	{/if}
{/snippet}

<section class="flex flex-col gap-2">
	{@render row(
		locale.settings.push.toggle,
		locale.settings.push.help,
		locale.settings.push.failed,
		reminders
	)}
	{@render row(
		locale.settings.push.lockScreen,
		locale.settings.push.lockScreenHelp,
		locale.settings.push.lockScreenFailed,
		lockScreen
	)}
</section>
