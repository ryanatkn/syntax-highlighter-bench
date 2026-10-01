<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';

	import {
		BUNDLE_VIEWS,
		to_bundle_cost_groups,
		to_bundle_total_groups,
		to_combined_sets,
		type BundleCompression
	} from '$lib/bundle_matrix.ts';
	import { format_source_key } from '$lib/cell_groups.ts';
	import FilterGroup from '$lib/FilterGroup.svelte';
	import FilterSelect from '$lib/FilterSelect.svelte';
	import MatrixTable from '$lib/MatrixTable.svelte';
	import { OUTPUT_MEASURES, to_output_groups } from '$lib/output_matrix.ts';
	import Provenance from '$lib/Provenance.svelte';
	import {
		RESULTS_METRICS,
		decode_results_filters,
		encode_results_filters,
		to_default_results_filters,
		to_results_filter_options,
		to_selected_libraries,
		to_selected_reference,
		type ResultsFilters,
		type ResultsMetric
	} from '$lib/results_filters.ts';
	import { find_startup_bare, to_startup_groups } from '$lib/startup_matrix.ts';
	import {
		THROUGHPUT_UNITS,
		results_have_throughput,
		to_throughput_groups,
		to_throughput_summary,
		type ThroughputUnit
	} from '$lib/throughput_matrix.ts';
	import type { PageProps } from './$types.js';

	const { data }: PageProps = $props();

	const results = $derived(data.results);
	const options = $derived(to_results_filter_options(results));
	const defaults = $derived(to_default_results_filters(options));

	// the page prerenders with the defaults, and the query applies once it has hydrated,
	// so the first client render matches the prerendered one
	let hydrated = $state(false);
	onMount(() => {
		hydrated = true;
	});

	// the query is the state: a control navigates, and the selection is read back from the url
	const filters = $derived(
		hydrated ? decode_results_filters(page.url.searchParams, options, defaults) : defaults
	);

	const update = (patch: Partial<ResultsFilters>): void => {
		const query = encode_results_filters({ ...filters, ...patch }, defaults).toString();
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(resolve('/results') + (query ? `?${query}` : ''), {
			replaceState: true,
			keepFocus: true,
			noScroll: true
		});
	};

	const shows = (metric: ResultsMetric): boolean => filters.metrics.includes(metric);

	const libraries = $derived(to_selected_libraries(results.meta.libraries, filters));
	const library_ids = $derived(libraries.map((library) => library.id));
	const reference = $derived(to_selected_reference(libraries, filters));

	const to_choices = (ids: ReadonlyArray<string>): Array<{ id: string; label: string }> =>
		ids.map((id) => ({ id, label: id.replaceAll('_', ' ') }));

	const library_choices = $derived(
		results.meta.libraries.map((library) => ({ id: library.id, label: library.label }))
	);
	const lang_choices = $derived(results.langs.map((lang) => ({ id: lang.id, label: lang.label })));
	const source_choices = $derived(
		options.sources.map((id) => ({ id, label: format_source_key(id) }))
	);
	const set_choices = $derived(
		to_combined_sets(results.sets).map((set) => ({ id: set.ids[0]!, label: set.label }))
	);

	const cell_selection = $derived({
		langs: filters.langs,
		sizes: filters.sizes,
		sources: filters.sources,
		modes: filters.modes,
		unit: filters.unit as ThroughputUnit
	});
	const throughput_groups = $derived(
		results_have_throughput(results)
			? [
					to_throughput_summary(results, cell_selection, library_ids),
					...to_throughput_groups(results, cell_selection, library_ids)
				].filter((group) => group.rows.length > 0)
			: null
	);
	const startup_groups = $derived(
		find_startup_bare(results) ? to_startup_groups(results, filters, library_ids) : null
	);
	const bundle_selection = $derived({
		langs: filters.langs,
		set: filters.set,
		compression: filters.compression as BundleCompression
	});
	const bundle_groups = $derived(
		filters.bundle === 'totals'
			? to_bundle_total_groups(results, bundle_selection)
			: to_bundle_cost_groups(results, bundle_selection)
	);
	const output_groups = $derived(to_output_groups(results, filters));
</script>

<svelte:head>
	<title>results · syntax-highlighter-bench</title>
</svelte:head>

<section>
	<h1>Results</h1>
	<Provenance meta={results.meta} moved={data.moved}>
		<a href={resolve('/docs/method')}>The method</a> says how each number is measured and what it
		leaves out.
	</Provenance>
	<p>
		Each row is one thing measured, with a column for each library. Beside a number is its ratio to
		the best in the row, or to a reference library you choose: <code>1.00×</code> is the baseline
		and <code>2.00×</code> is twice as slow or twice as large. A library with no number in a row
		says why: <em>unsupported</em> when its adapter doesn't claim the language, and
		<em>excluded</em> when it claims it and its output failed the check that runs before measuring.
		Neither is a zero, and neither enters a mean.
	</p>
</section>

<section>
	<h2>Compare</h2>
	<p><small>The selection is kept in the address, so a comparison is a link.</small></p>
	<form class="filters">
		<FilterGroup
			legend="Sections"
			options={RESULTS_METRICS}
			selected={filters.metrics}
			onchange={(metrics) => update({ metrics })}
		/>
		<FilterGroup
			legend="Libraries"
			options={library_choices}
			selected={filters.libraries}
			onchange={(selected) => update({ libraries: selected })}
		/>
		<FilterGroup
			legend="Engine kind"
			options={to_choices(options.engines)}
			selected={filters.engines}
			onchange={(engines) => update({ engines })}
		/>
		<FilterGroup
			legend="HTML output"
			options={to_choices(options.outputs)}
			selected={filters.outputs}
			onchange={(outputs) => update({ outputs })}
		/>
		<FilterGroup
			legend="Languages"
			options={lang_choices}
			selected={filters.langs}
			onchange={(langs) => update({ langs })}
		/>
		<FilterGroup
			legend="Input sizes"
			options={to_choices(options.sizes)}
			selected={filters.sizes}
			onchange={(sizes) => update({ sizes })}
		/>
		<FilterGroup
			legend="Modes"
			options={to_choices(options.modes)}
			selected={filters.modes}
			onchange={(modes) => update({ modes })}
		/>
		<FilterGroup
			legend="Input sources"
			options={source_choices}
			selected={filters.sources}
			onchange={(sources) => update({ sources })}
		/>
		<FilterSelect
			label="Ratios against"
			options={[{ id: '', label: 'the best in each row' }, ...library_choices]}
			value={filters.reference ?? ''}
			onchange={(value) => update({ reference: value === '' ? null : value })}
		/>
	</form>
	<p>
		<small>
			A <code>home</code> source is a library's own samples: home turf for that library, and always
			labelled with its name. The libraries contributed very different amounts, so home inputs are
			grouped and summarized by owner and never pooled.
			<a href={resolve('/docs/corpus')}>The corpus docs</a> list every input.
		</small>
	</p>
</section>

{#if filters.metrics.length === 0}
	<section><p>No section is selected.</p></section>
{:else if libraries.length === 0}
	<section><p>No library is selected.</p></section>
{:else}
	{#if shows('throughput')}
		<section id="throughput">
			<h2>Throughput</h2>
			{#if throughput_groups === null}
				<p>
					No timed results are published yet. This section will show how fast each library tokenizes
					each input and renders it as HTML.
				</p>
			{:else}
				<FilterSelect
					label="Shown as"
					options={THROUGHPUT_UNITS}
					value={filters.unit}
					onchange={(unit) => update({ unit })}
				/>
				{#if throughput_groups.length === 0}
					<p>No cell matches the selection.</p>
				{:else}
					<MatrixTable
						{libraries}
						groups={throughput_groups}
						heading="input"
						label="Throughput by input and library"
						{reference}
					>
						A warm library on one input, in one mode. MB/s compares across inputs of different
						sizes, and time per call does not: the large inputs differ several times over in size. A
						geometric mean covers only the rows where every selected library has a number, and says
						how many. A <em>disturbed</em> mark is a value whose rounds disagreed, and
						<em>retried</em> one that was measured again. A ratio marked <code>≈</code> is inside
						the machine's noise floor.
					</MatrixTable>
				{/if}
			{/if}
		</section>
	{/if}

	{#if shows('startup')}
		<section id="startup">
			<h2>Cold start</h2>
			{#if startup_groups === null}
				<p>
					No timed results are published yet. This section will show what each library adds to a
					fresh Node process: importing it, and producing a first highlight.
				</p>
			{:else}
				<form class="filters">
					<FilterGroup
						legend="Loaded as"
						options={to_choices(options.forms)}
						selected={filters.forms}
						onchange={(forms) => update({ forms })}
					/>
				</form>
				{#if startup_groups.length === 0}
					<p>No scenario matches the selection.</p>
				{:else}
					<MatrixTable
						{libraries}
						groups={startup_groups}
						heading="loaded"
						label="Cold start by scenario and library"
						{reference}
					>
						What each library adds to a fresh Node process: the scenario's median time less the bare
						Node baseline's, which every sample includes. The details of a row give the whole time
						and the process's peak memory. Bundled is the one chunk whose size is reported below,
						and unbundled is the same module imported from <code>node_modules</code>. A ratio
						between small additions is large even when the processes take nearly the same time. An
						addition smaller than bare Node's own spread, the gap between its 10th and 90th
						percentile, is marked <em>in the noise</em>: it can't be told from adding nothing, and
						has no ratio. In a row with such an addition the others are compared with that spread
						instead of with the best, and marked <code>≥</code>: at least so many times the spread,
						and so at least so many times the best, which is smaller than the spread. Such a row is
						left out of the mean. A reference library is used only in the rows where its own
						addition is outside the noise.
					</MatrixTable>
				{/if}
			{/if}
		</section>
	{/if}

	{#if shows('bundle')}
		<section id="bundle">
			<h2>Bundle size</h2>
			{#if bundle_groups.length === 0}
				<p>These results hold no bundle sizes.</p>
			{:else}
				<form class="filters">
					<FilterSelect
						label="View"
						options={BUNDLE_VIEWS}
						value={filters.bundle}
						onchange={(bundle) => update({ bundle })}
					/>
					<FilterSelect
						label="Bytes"
						options={to_choices(options.compression)}
						value={filters.compression}
						onchange={(compression) => update({ compression })}
					/>
					<FilterSelect
						label="Set"
						options={set_choices}
						value={filters.set}
						onchange={(set) => update({ set })}
					/>
				</form>
				<MatrixTable
					{libraries}
					groups={bundle_groups}
					heading={filters.bundle === 'totals' ? 'set' : 'language'}
					label="Bundle size by {filters.bundle === 'totals' ? 'set' : 'language'} and library"
					{reference}
				>
					{#if filters.bundle === 'totals'}
						The minified JavaScript of each library over each feature set, measured as one bundle.
						Sets that hold the same languages are one bundle, so they share a row. A set holding a
						language a library doesn't claim is unsupported for it, and names the language.
						"Everything loaded" adds the wasm binary and the theme stylesheet to the JavaScript,
						each compressed on its own, so a library whose engine ships as wasm is not compared on
						its JavaScript alone.
					{:else}
						What each language adds to a library's minified JavaScript: the bundle with that
						language alone, less the bundle with none. The sum of the rows of a set is not a bundle,
						so it has no ratio: it exceeds the set's measured size when a library shares code
						between languages, or when one language brings another with it, as HTML brings the
						script and style languages.
					{/if}
					The wasm binary and the theme stylesheet are loaded beside the JavaScript, and each has a
					row of its own.
				</MatrixTable>
			{/if}
		</section>
	{/if}

	{#if shows('output')}
		<section id="output">
			<h2>Tokens and output</h2>
			<form class="filters">
				<FilterGroup
					legend="Numbers"
					options={OUTPUT_MEASURES}
					selected={filters.measures}
					onchange={(measures) => update({ measures })}
				/>
			</form>
			{#if output_groups.length === 0}
				<p>No input matches the selection.</p>
			{:else}
				<MatrixTable
					{libraries}
					groups={output_groups}
					heading="input"
					label="Tokens and output by input and library"
					{reference}
					colored={false}
				>
					How many tokens each library finds in an input, and how large its HTML is. The ratios are
					not colored, because smaller is not better here: libraries split the same source
					differently and wrap their HTML differently, so fewer tokens is less output, not a faster
					library. <a href={resolve('/docs/deterministic')}>The deterministic metrics docs</a> say
					what each counts.
				</MatrixTable>
			{/if}
		</section>
	{/if}
{/if}

<style>
	.filters {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		gap: var(--space_lg);
	}
</style>
