<script lang="ts">
	import type { Snippet } from 'svelte';
	import { site_context } from '@fuzdev/fuz_ui/site.svelte.ts';

	import type { BenchMeta } from './results_schema.ts';
	import { format_date, format_hash, format_percent } from './bench_format.ts';

	const {
		meta,
		moved = [],
		children
	}: {
		meta: BenchMeta;
		/** What has changed since the run was measured, as `SiteResults` holds it. */
		moved?: ReadonlyArray<string>;
		/** Shown after the provenance line, in the same paragraph: links to the method. */
		children?: Snippet;
	} = $props();

	const site = site_context.get();

	/** The calibration's figure for two processes, shown beside the run's own. */
	const process_floor = $derived(meta.noise_floor?.per_process ?? null);

	const process_floor_note = $derived(
		process_floor === null
			? ''
			: `, against ${format_percent(process_floor)} at the 95th percentile in the calibration`
	);

	const clean_commit = $derived(meta.commit?.replace(/-dirty$/, '') ?? null);

	/** The machine's state, leaving out what the OS didn't expose. */
	const machine_parts = $derived.by(() => {
		const m = meta.machine;
		if (!m) return [];
		return [
			m.cpu,
			m.threads === null ? null : `${m.threads} threads`,
			m.governor === null ? null : `${m.governor} governor`,
			m.cpufreq_driver === null ? null : `${m.cpufreq_driver} driver`,
			m.epp === null ? null : `energy preference ${m.epp}`,
			m.boost === null ? null : `boost ${m.boost ? 'on' : 'off'}`,
			`${m.memory_gb} GB`,
			`kernel ${m.os_release}`
		].filter((part) => part !== null);
	});
</script>

{#if meta.machine && meta.generated_at && meta.commit}
	<p>
		Timed on <strong>{meta.machine.name}</strong>: {machine_parts.join(', ')}, Node {meta.node}. Run
		of {format_date(meta.generated_at)} at commit
		{#if site.repo_url}
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
			<a href="{site.repo_url}/commit/{clean_commit}" rel="external">
				<code>{format_hash(meta.commit)}</code>
			</a>
		{:else}
			<code>{format_hash(meta.commit)}</code>
		{/if}, corpus <code title={meta.corpus_hash}>{format_hash(meta.corpus_hash)}</code>.
		{#if meta.anchor}
			Its anchor was stable, with a drift of {format_percent(Math.abs(meta.anchor.drift))}.
		{/if}
		{#if meta.noise_floor}
			The machine's noise floor is {format_percent(meta.noise_floor.per_cell)} for one cell and
			{format_percent(meta.noise_floor.geomean)} for a geometric mean: a smaller difference is not a
			result.
		{:else}
			The machine has no calibrated noise floor for this run, so small differences can't be told
			from noise.
		{/if}
		{#if meta.process_noise}
			Two processes measuring the same library on the same cell in this run were
			{format_percent(meta.process_noise.p95)} apart at the 95th percentile and
			{format_percent(meta.process_noise.median)} at the median{process_floor_note}.
		{/if}
		{@render children?.()}
	</p>
	{#if moved.length > 0}
		<p>
			<small>
				These numbers are the run's own, a snapshot of what it measured. Since then:
				{moved.join('; ')}.
			</small>
		</p>
	{/if}
{:else}
	<p>
		<strong>No timed results are published yet.</strong> What is shown is the deterministic results,
		which are the same on any machine: corpus
		<code title={meta.corpus_hash}>{format_hash(meta.corpus_hash)}</code
		>{#if meta.bundler}
			, bundles built by Vite {meta.bundler.vite} (Rollup {meta.bundler.rollup}, esbuild
			{meta.bundler.esbuild}), gzip level {meta.bundler.gzip_level}, brotli quality
			{meta.bundler.brotli_quality}
		{/if}.
		{@render children?.()}
	</p>
{/if}
