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
			compares Twinkleplop, Prism, Shiki, and fuz_code, with Shiki's JS engine and its Oniguruma
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
		<TomeSectionHeader text="What is measured" />
		<p>
			Every library is run on the same inputs, each labeled by its source. Real code that no
			measured library authored is the primary set and the only one the headline figures use; a
			library's own samples and the inputs built to find worst cases are summarized apart from it —
			see <TomeLink slug="corpus" />. A language is timed only when every library supports it — see
			<TomeLink slug="languages" />.
		</p>
		<p>The numbers are of two classes, kept apart in the results file.</p>
		<p>
			<strong>Machine-dependent</strong>, published from one named machine, with each library alone
			in a process of its own — see <TomeLink slug="method" />:
		</p>
		<ul>
			<li>
				<strong>Throughput</strong>: how long a warm library takes on each input, in two modes,
				<code>tokenize</code> (tokens out) and <code>html</code> (the HTML string a consumer ships).
				The peak memory of its process is recorded beside it, which on a small input follows what
				the measuring allocated more than what the library holds.
			</li>
			<li>
				<strong>Cold start</strong>: how long a fresh Node process takes to import a library alone,
				with one language, and with a documentation site's languages, and to produce a first
				highlight. Each is measured for the bundled chunk and for the library imported unbundled,
				beside a bare Node baseline to subtract, with the process's peak memory.
			</li>
		</ul>
		<p>
			<strong>Deterministic</strong>, the same on any machine, committed as
			<code>results/deterministic.json</code> — see <TomeLink slug="deterministic" />:
		</p>
		<ul>
			<li>
				<strong>Bundle size</strong> for each feature set: minified, gzip, and brotli, with the wasm
				binary and the theme CSS reported apart from the JS.
			</li>
			<li>
				<strong>Token counts</strong>: each library's own, recorded and never equalised, since
				libraries split the same source differently.
			</li>
			<li><strong>Output sizes</strong>: the HTML of each input, raw and compressed.</li>
			<li>
				<strong>Retained heap</strong>: what a library holds after loading one language and
				highlighting once, as V8's heap, its machine code, and external memory. Unlike the others it
				is the same only for a Node version and architecture, and within a small tolerance.
			</li>
			<li>
				<strong>Install footprint</strong>: the packages, files, and bytes that installing a library
				adds.
			</li>
			<li><strong>Coverage</strong>: which library claims which language.</li>
		</ul>
		<p>
			A language a library doesn't claim is <em>unsupported</em>, and a claimed one whose output
			fails the check before measuring is <em>excluded</em>. The two are recorded differently, and
			neither is ever a zero or part of a mean.
		</p>
		<p>
			What is not measured: the quality of the highlighting, anything in a browser, a library's
			async path, and what one library offers that another doesn't. The numbers compare the work the
			libraries share, in Node, through each one's synchronous calls. The
			<TomeLink slug="method" hash="Caveats">caveats</TomeLink> say what else to hold against them.
		</p>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="What exists" />
		<p>
			Three parts are built: the harness that times the libraries, warm and from a cold start, the
			deterministic measurements, and the pages that render a results file. The harness is
			<code>bench/</code>, which runs on Node directly and is never imported by the site, and the
			site is <code>src/routes/</code> and <code>src/lib/</code>, built as static pages.
			{#if docs.source === 'deterministic'}
				No timed run has been published, so the pages show the deterministic numbers and say so
				where a timed one would be.
			{/if}
		</p>
		<ul>
			<li>
				an adapter for each library, in <code>bench/libraries/</code>, and the output check each
				passes before it is measured, in <code>bench/check_output.ts</code> — see
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
				the deterministic measurements, listed below, in <code>bench/deterministic.ts</code>, with
				their numbers committed as <code>results/deterministic.json</code> — see
				<TomeLink slug="deterministic" />
			</li>
			<li>
				the runs the harness writes, in <code>results/</code>, where a published timed run goes
				beside the deterministic file as <code>results/latest.json</code> — see
				<TomeLink slug="results" />
			</li>
			<li>
				the schema of the results file, which the harness and the site share, in
				<ModuleLink module_path="results_schema.ts" />, with
				<ModuleLink module_path="bench_constants.ts" />, the id lists it builds its enums from — see
				<TomeLink slug="results" />
			</li>
			<li>
				the landing page and the results page, which render one validated results file, in
				<code>src/routes/</code> and <code>src/lib/</code> — see <TomeLink slug="results" /> for
				which file
			</li>
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
