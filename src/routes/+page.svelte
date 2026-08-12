<script lang="ts">
	import { applyAction, enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { DETAIL_FIELDS, DETAIL_REQUIRED, detailSummary } from '$lib/events';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const CATEGORY_LABELS: Record<string, string> = {
		routine: 'Rutin',
		care: 'Skötsel',
		health: 'Hälsa'
	};
	const CATEGORY_COLORS: Record<string, string> = {
		routine: 'bg-emerald-600 active:bg-emerald-700',
		care: 'bg-sky-600 active:bg-sky-700',
		health: 'bg-amber-600 active:bg-amber-700'
	};

	// sort_order already groups the catalogue by category.
	const categories = $derived([...new Set(data.types.map((t) => t.category))]);

	const timeFormat = new Intl.DateTimeFormat('sv-SE', {
		timeZone: 'Europe/Stockholm',
		weekday: 'short',
		day: 'numeric',
		month: 'short',
		hour: '2-digit',
		minute: '2-digit'
	});

	// Optimistic log rows: shown in the list the instant a button is tapped,
	// removed once the server round-trip has refreshed the real data.
	type PendingEvent = {
		key: string;
		icon: string | null;
		label: string;
		occurred_at: string;
	};
	let pending = $state<PendingEvent[]>([]);
	let quickError = $state<string | null>(null);

	const quickLog =
		(type: (typeof data.types)[number]): SubmitFunction =>
		() => {
			quickError = null;
			const key = crypto.randomUUID();
			pending = [
				{ key, icon: type.icon, label: type.label, occurred_at: new Date().toISOString() },
				...pending
			];
			return async ({ result }) => {
				if (result.type === 'failure' || result.type === 'error') {
					pending = pending.filter((p) => p.key !== key);
					quickError =
						result.type === 'failure'
							? ((result.data?.message as string) ?? 'Något gick fel.')
							: 'Något gick fel.';
				} else {
					// Follows the redirect and reloads data before the
					// placeholder row is removed, so the row never blinks out.
					await applyAction(result);
					pending = pending.filter((p) => p.key !== key);
				}
			};
		};

	const listRows = $derived(
		[
			...pending.map((p) => ({
				key: p.key,
				icon: p.icon,
				label: p.label,
				occurred_at: p.occurred_at,
				extra: ''
			})),
			...data.events.map((e) => ({
				key: e.id,
				icon: e.type?.icon ?? null,
				label: e.type?.label ?? e.type_id,
				occurred_at: e.occurred_at,
				extra: [detailSummary(e.type_id, e.details), e.note].filter(Boolean).join(' · ')
			}))
		].slice(0, 10)
	);
</script>

<svelte:head><title>Hundkoll</title></svelte:head>

<main class="mx-auto flex min-h-dvh max-w-sm flex-col gap-6 p-4 pb-10">
	<header class="flex items-center justify-between px-1">
		<h1 class="text-3xl font-bold">{data.dog?.name ?? 'Hundkoll'}</h1>
		<form method="POST" action="?/logout" use:enhance>
			<button type="submit" class="text-sm text-gray-500 underline">Logga ut</button>
		</form>
	</header>

	{#if quickError || (form?.message && !data.detailType)}
		<p class="rounded-lg bg-red-50 p-4 text-red-800">{quickError ?? form?.message}</p>
	{/if}

	{#each categories as category (category)}
		<section class="flex flex-col gap-2">
			<h2 class="px-1 text-sm font-semibold tracking-wide text-gray-500 uppercase">
				{CATEGORY_LABELS[category] ?? category}
			</h2>
			<div class="grid grid-cols-3 gap-2">
				{#each data.types.filter((t) => t.category === category) as type (type.id)}
					<div class="relative">
						{#if DETAIL_REQUIRED.has(type.id)}
							<!-- A bare tap would be meaningless (e.g. weight without kg) -->
							<a
								href="?detail={type.id}"
								class="flex w-full flex-col items-center gap-1 rounded-2xl px-1 py-4 text-white transition active:scale-95 {CATEGORY_COLORS[
									category
								]}"
							>
								<span class="text-3xl" aria-hidden="true">{type.icon}</span>
								<span class="text-sm font-semibold">{type.label}</span>
							</a>
						{:else}
							<form method="POST" action="?/log" use:enhance={quickLog(type)}>
								<input type="hidden" name="type_id" value={type.id} />
								<button
									type="submit"
									class="flex w-full flex-col items-center gap-1 rounded-2xl px-1 py-4 text-white transition active:scale-95 {CATEGORY_COLORS[
										category
									]}"
								>
									<span class="text-3xl" aria-hidden="true">{type.icon}</span>
									<span class="text-sm font-semibold">{type.label}</span>
								</button>
							</form>
							<a
								href="?detail={type.id}"
								aria-label="Logga {type.label.toLowerCase()} med tid och detaljer"
								class="absolute top-0 right-0 rounded-full p-2 text-lg leading-none text-white/80"
							>
								⋯
							</a>
						{/if}
					</div>
				{/each}
			</div>
		</section>
	{/each}

	<section class="flex flex-col gap-2">
		<h2 class="px-1 text-sm font-semibold tracking-wide text-gray-500 uppercase">
			Senaste händelser
		</h2>
		{#if listRows.length === 0}
			<p class="px-1 text-gray-500">Inget loggat ännu.</p>
		{:else}
			<ul class="divide-y divide-gray-200 px-1">
				{#each listRows as row (row.key)}
					<li class="flex items-baseline justify-between gap-3 py-2">
						<span class="min-w-0">
							<span class="font-medium">{row.icon} {row.label}</span>
							{#if row.extra}
								<span class="block truncate text-sm text-gray-500">{row.extra}</span>
							{/if}
						</span>
						<time datetime={row.occurred_at} class="shrink-0 text-sm text-gray-500">
							{timeFormat.format(new Date(row.occurred_at))}
						</time>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</main>

{#if data.detailType}
	<!-- Server-rendered dialog: opened by ?detail=<id>, closed by a plain
	     link back to "/", so it works without JavaScript. -->
	<div class="fixed inset-0 z-10 flex items-end justify-center bg-black/40 sm:items-center">
		<div
			role="dialog"
			aria-modal="true"
			aria-label="Logga {data.detailType.label.toLowerCase()}"
			class="w-full max-w-sm rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl"
		>
			<h2 class="mb-4 text-xl font-bold">
				{data.detailType.icon}
				{data.detailType.label}
			</h2>

			{#if form?.message}
				<p class="mb-3 rounded-lg bg-red-50 p-3 text-red-800">{form.message}</p>
			{/if}

			<form method="POST" action="?/log" use:enhance class="flex flex-col gap-3">
				<input type="hidden" name="type_id" value={data.detailType.id} />
				<input type="hidden" name="detailed" value="1" />

				<label class="flex flex-col gap-1">
					<span class="text-sm font-medium text-gray-700">Tidpunkt</span>
					<input
						type="datetime-local"
						name="occurred_at"
						value={data.nowLocal}
						max={data.nowLocal}
						required
						class="rounded-lg border-gray-300"
					/>
				</label>

				{#each DETAIL_FIELDS[data.detailType.id] ?? [] as field (field.name)}
					{#if field.input === 'checkbox'}
						<label class="flex items-center gap-2">
							<input type="checkbox" name={field.name} class="rounded border-gray-300" />
							<span class="text-sm font-medium text-gray-700">{field.label}</span>
						</label>
					{:else}
						<label class="flex flex-col gap-1">
							<span class="text-sm font-medium text-gray-700">{field.label}</span>
							<input
								type="number"
								name={field.name}
								inputmode="decimal"
								step={field.step ?? '1'}
								min="0"
								required={field.required ?? false}
								class="rounded-lg border-gray-300"
							/>
						</label>
					{/if}
				{/each}

				<label class="flex flex-col gap-1">
					<span class="text-sm font-medium text-gray-700">Anteckning</span>
					<textarea name="note" rows="2" class="rounded-lg border-gray-300"></textarea>
				</label>

				<div class="mt-2 flex gap-2">
					<a
						href="/"
						class="flex-1 rounded-lg border border-gray-300 px-4 py-3 text-center font-semibold text-gray-700"
					>
						Avbryt
					</a>
					<button
						type="submit"
						class="flex-1 rounded-lg bg-gray-900 px-4 py-3 font-semibold text-white active:bg-gray-700"
					>
						Spara
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}
