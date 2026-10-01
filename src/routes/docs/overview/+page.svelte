<script lang="ts">
	import TomeContent from '@fuzdev/fuz_ui/TomeContent.svelte';
	import TomeLink from '@fuzdev/fuz_ui/TomeLink.svelte';
	import ModuleLink from '@fuzdev/fuz_ui/ModuleLink.svelte';
	import TomeSection from '@fuzdev/fuz_ui/TomeSection.svelte';
	import TomeSectionHeader from '@fuzdev/fuz_ui/TomeSectionHeader.svelte';
	import { tome_get_by_slug } from '@fuzdev/fuz_ui/tome.ts';

	const tome = tome_get_by_slug('overview');
</script>

<TomeContent {tome}>
	<section>
		<p>
			syntax-highlighter-bench is a benchmark suite and results site for JavaScript syntax
			highlighters. It compares fuz_code, twinkleplop, Prism, and Shiki, with Shiki's JavaScript
			engine and its Oniguruma wasm engine counted as two libraries.
		</p>
		<p>
			A run produces one results file holding many metrics, and the site is a view over that file
			where a reader picks the libraries, languages, and metrics to compare.
		</p>
	</section>
	<TomeSection>
		<TomeSectionHeader text="What exists" />
		<p>The harness that times the libraries is built, and no run has been published:</p>
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
				the schema of the results file, in <ModuleLink module_path="results_schema.ts" /> — see
				<TomeLink slug="results" />
			</li>
		</ul>
		<p>
			The bundle and cold-start measurements, the results pages, and a published run are designed
			but not built. <TomeLink slug="design" /> describes them.
		</p>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="Layout" />
		<ul>
			<li>
				<code>bench/</code> — the harness. It runs on Node directly and is never imported by the
				site.
			</li>
			<li>
				<code>results/</code> — where the harness writes runs. None is committed yet.
			</li>
			<li>
				<code>src/lib/results_schema.ts</code> — the one module the harness and the site share.
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
				every input is labelled by its source, and real code that no measured library authored is
				the primary set; a snippet written for this benchmark is labelled as that, never as neutral
			</li>
			<li>
				each library is driven through one adapter with notes on the entry points it uses, so its
				maintainers can review or replace it
			</li>
			<li>the method and the commands to reproduce a run are published with the numbers</li>
		</ul>
	</TomeSection>
</TomeContent>
