<script lang="ts">
	import TomeContent from '@fuzdev/fuz_ui/TomeContent.svelte';
	import TomeLink from '@fuzdev/fuz_ui/TomeLink.svelte';
	import ModuleLink from '@fuzdev/fuz_ui/ModuleLink.svelte';
	import DeclarationLink from '@fuzdev/fuz_ui/DeclarationLink.svelte';
	import TomeSection from '@fuzdev/fuz_ui/TomeSection.svelte';
	import TomeSectionHeader from '@fuzdev/fuz_ui/TomeSectionHeader.svelte';
	import { tome_get_by_slug } from '@fuzdev/fuz_ui/tome.ts';

	const tome = tome_get_by_slug('results');
</script>

<TomeContent {tome}>
	<section>
		<p>
			A run of the benchmark is one JSON file. The harness writes it and the site reads it, and both
			go through the same schema, <DeclarationLink name="BenchResults" /> in
			<ModuleLink module_path="results_schema.ts" />, so a malformed run fails loudly instead of
			rendering blanks. The schema is strict: an unknown key is an error.
		</p>
		<p>No run has been published yet. The schema is what exists.</p>
	</section>
	<TomeSection>
		<TomeSectionHeader text="Sections" />
		<ul>
			<li>
				<DeclarationLink name="BenchMeta" /> — the machine, Node version, commit, and corpus hash;
				the roster of libraries with their versions; the excluded list; the anchor's drift; the
				machine's noise floor
			</li>
			<li>
				<DeclarationLink name="BenchLang" /> and <DeclarationLink name="BenchSet" /> — the language
				ids and feature sets of the run, described in <TomeLink slug="languages" />
			</li>
			<li>
				<DeclarationLink name="BenchInput" /> — the inputs the run measured, each with its source,
				size tier, hash, and the upstream commit it was copied from, as in the
				<TomeLink slug="corpus" /> manifest
			</li>
			<li>
				<DeclarationLink name="BenchCell" /> — one input measured in one mode, with each library's
				numbers
			</li>
			<li><DeclarationLink name="BenchStartup" /> — cold-start measurements</li>
			<li>
				<DeclarationLink name="BenchBundleEntry" /> — bundle sizes for each library over each
				feature set
			</li>
			<li>
				<DeclarationLink name="BenchCoverageEntry" /> — which languages each library claims, with a
				footnote where the support is indirect
			</li>
		</ul>
		<p>
			The file describes itself. The libraries, languages, sets, and inputs are lists inside it, and
			every other section refers to them by id, or by file for inputs, so the site needs no list of
			its own and adding a library changes no site code.
		</p>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="Two classes of number" />
		<p>
			<strong>Machine-dependent</strong> numbers come from timing on one named machine and mean
			nothing apart from it: throughput and memory in each cell's <code>values</code>, and the
			<code>startup</code> section.
		</p>
		<p>
			<strong>Deterministic</strong> numbers come out the same anywhere: token counts and output
			size in each cell's <code>tokens</code> and <code>output</code>, plus <code>bundle</code> and
			<code>coverage</code>.
		</p>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="Consistency checks" />
		<p>Beyond the shape of each section, parsing checks that the sections agree:</p>
		<ul>
			<li>
				every library, language, set, and cell id is unique and refers to a listed entry, except the
				library a home input came from, which may be outside the run
			</li>
			<li>
				no two cells measure the same input in the same mode, and no cell covers an untimed language
			</li>
			<li>every cell names a listed input and describes it as that entry does</li>
			<li>
				an input written for the benchmark has no provenance, a copied one has the hash its
				provenance pins, and one built from several files is marked synthetic
			</li>
			<li>a run with timed numbers records its anchor</li>
			<li>
				each startup entry carries the fields its scenario needs and no others, for languages the
				library claims, and appears once
			</li>
			<li>a library has no numbers for a language its coverage doesn't claim</li>
			<li>
				a library listed as excluded from a cell claims that cell's language and has no numbers
				there
			</li>
			<li>
				a bundle entry holds sizes only when the library claims every language of the set, and
				otherwise names exactly the languages it lacks
			</li>
		</ul>
		<p>
			Use <DeclarationLink name="parse_bench_results" /> to validate a file and get every problem in
			one message.
		</p>
	</TomeSection>
</TomeContent>
