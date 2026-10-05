<script lang="ts">
	import { onMount } from 'svelte';
	import * as locale from '$lib/locale';
	import { isNativeApp } from '$lib/native';
	import PushSection from '$lib/components/settings/PushSection.svelte';
	import SettingsPage from '$lib/components/settings/SettingsPage.svelte';

	// Decided in the page, not the load: requests through the service worker
	// carry Android's default user agent, without the app's suffix.
	let nativeApp = $state(false);
	onMount(() => {
		nativeApp = isNativeApp();
	});
</script>

<SettingsPage title={locale.settings.pages.notifications}>
	{#if nativeApp}
		<PushSection />
	{:else}
		<p class="px-1 text-sm text-ink-muted">{locale.settings.notificationsAppOnly}</p>
	{/if}
</SettingsPage>
