<script lang="ts">
	import TomeContent from '@fuzdev/fuz_ui/TomeContent.svelte';
	import TomeLink from '@fuzdev/fuz_ui/TomeLink.svelte';
	import ModuleLink from '@fuzdev/fuz_ui/ModuleLink.svelte';
	import TomeSection from '@fuzdev/fuz_ui/TomeSection.svelte';
	import TomeSectionHeader from '@fuzdev/fuz_ui/TomeSectionHeader.svelte';
	import { tome_get_by_slug } from '@fuzdev/fuz_ui/tome.ts';
	import { resolve } from '$app/paths';

	import { docs_data_context } from '#lib/docs_data.ts';

	const tome = tome_get_by_slug('overview');

	const get_docs = docs_data_context.get();
	const docs = $derived(get_docs());
</script>

<TomeContent {tome}>
	<section>
		<p>
			syntax-highlighter-bench is a benchmark suite and results site for JS syntax highlighters. It
			compares fuz_code, Twinkleplop, Prism, and Shiki, with Shiki's JS engine and its Oniguruma
			wasm engine counted as two libraries.
		</p>
		<p>
			A run produces one results file holding many metrics, and the site is a view over that file
			where a reader picks the libraries, languages, and metrics to compare:
			<a href={resolve('/(site)/results')}>the results page</a>.
		</p>
		<p>AI disclosure: this is an LLM-generated repo guided by a person.</p>
	</section>
	<TomeSection>
		<TomeSectionHeader text="What exists" />
		<p>
			The harness that times the libraries, warm and from a cold start, the deterministic
			measurements, and the pages that render a results file are built.
			{#if docs.source === 'deterministic'}
				No timed run has been published, so the pages show the deterministic numbers and say so
				where a timed one would be.
			{/if}
		</p>
		<ul>
			<li>
				an adapter for each library, and the check that guards against a plain-text fallback, in
				<code>bench/libraries/</code> and <code>bench/check_output.ts</code> — see
				<TomeLink slug="adapters" />
			</li>
			<li>
				the inputs and their manifest, in <code>bench/corpus/</code> — see
				<TomeLink slug="corpus" />
			</li>
			<li>
				the language ids and the feature sets, in <code>bench/langs.ts</code> and
				<code>bench/sets.ts</code> — see <TomeLink slug="languages" />
			</li>
			<li>
				the timed harness, which measures each library alone in a process of its own and writes a
				results file, in <code>bench/run.ts</code> and <code>bench/cell.ts</code> — see
				<TomeLink slug="method" />
			</li>
			<li>
				cold start, part of the same run, where each sample is a fresh process that imports a
				library and stops its own clock, in <code>bench/coldstart.ts</code> — see
				<TomeLink slug="method" />
			</li>
			<li>
				the deterministic measurements, which are bundle size over each feature set, install
				footprint, retained heap, token counts, output sizes, and coverage, in
				<code>bench/deterministic.ts</code>, with their numbers committed as
				<code>results/deterministic.json</code> — see <TomeLink slug="deterministic" />
			</li>
			<li>
				the schema of the results file, in <ModuleLink module_path="results_schema.ts" /> — see
				<TomeLink slug="results" />
			</li>
			<li>
				the landing page and the results page, which render one validated results file, in
				<code>src/routes/</code> and <code>src/lib/</code> — see <TomeLink slug="results" /> for
				which file, and <TomeLink slug="design" /> for what is still to come
			</li>
		</ul>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="What is measured" />
		<ul>
			<li>
				<strong>Throughput</strong>, on one named machine: how long a warm library takes to tokenize
				an input, and to render it as HTML, with the peak memory of its process beside it.
			</li>
			<li>
				<strong>Cold start</strong>, on the same machine: how long a fresh Node process takes to
				import a library alone, with one language, and with a documentation site's languages, and to
				produce a first highlight. Each is measured for the bundled chunk and for the library
				imported unbundled, beside a bare Node baseline to subtract, with the process's peak memory.
			</li>
			<li>
				<strong>Deterministic numbers</strong>, the same anywhere: bundle size over each feature
				set, install footprint, retained heap, token counts, output sizes, and coverage.
			</li>
		</ul>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="Layout" />
		<ul>
			<li>
				<code>bench/</code> — the harness. It runs on Node directly and is never imported by the
				site.
			</li>
			<li>
				<code>results/</code> — where the harness writes runs. The deterministic results are
				committed there, and a published timed run goes beside them as
				<code>results/latest.json</code>.
			</li>
			<li>
				<code>src/lib/results_schema.ts</code> — the schema the harness and the site share, with
				<code>src/lib/bench_constants.ts</code>, the id lists it builds its enums from. The rest of
				<code>src/lib/</code> turns a results file into the tables of the site.
			</li>
			<li><code>src/routes/</code> — this site, built as static pages.</li>
		</ul>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="Neutrality" />
		<p>
			The maintainer of this benchmark also maintains fuz_code, one of the measured libraries, so
			fairness has to come from the structure rather than from trust:
		</p>
		<ul>
			<li>the maintainer's library is flagged in the results file and on the site</li>
			<li>
				every input is labeled by its source, and real code that no measured library authored is the
				primary set; a snippet or a stress input written for this benchmark is labeled as that,
				never as neutral, and no stress input is tuned to a library
			</li>
			<li>
				each library is driven through one adapter with notes on the entry points it uses, so its
				maintainers can review or replace it
			</li>
			<li>the method and the commands to reproduce a run are published with the numbers</li>
		</ul>
	</TomeSection>
</TomeContent>
