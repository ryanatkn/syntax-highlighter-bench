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
		<p>
			<code>bench/run.ts</code> writes one, as <TomeLink slug="method" /> describes. No run has been
			published yet.
		</p>
	</section>
	<TomeSection>
		<TomeSectionHeader text="Sections" />
		<ul>
			<li>
				<DeclarationLink name="BenchMeta" /> — the machine, Node version, commit, and corpus hash;
				what kind of run it was and how it measured, in <DeclarationLink name="BenchRun" />, with
				the retries it allowed and how many segments it was measured in; the roster of libraries
				with their versions; the excluded list; the anchor's drift; the machine's noise floor
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
				numbers. Its id is <code>&lt;file&gt;:&lt;mode&gt;</code>. Each value carries
				<code>attempts</code>: how many times the library was measured there, more than 1 when its
				rounds disagreed and it was retried. A retried value's spread and percentiles are those of
				the attempt that was kept
			</li>
			<li>
				<DeclarationLink name="BenchStartup" /> — cold-start measurements, which no run fills yet
			</li>
			<li>
				<DeclarationLink name="BenchBundleEntry" /> — bundle sizes for each library over each
				feature set, which no run fills yet
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
		<TomeSectionHeader text="Publishable or not" />
		<p>
			<code>meta.run</code> tells a publishable run from the rest. Its <code>kind</code> is
			<code>full</code>, <code>smoke</code>, or <code>calibrate</code>, and its <code>filters</code>
			are null unless the run was restricted to some libraries, languages, sizes, modes, or sources.
			A smoke run's numbers mean nothing, and a calibration exists for its noise floor.
		</p>
		<p>
			<DeclarationLink name="bench_results_is_publishable" /> is the test for a result: a full run
			with no filters and no gap, a stable anchor, and a commit that records everything that ran.
		</p>
		<p>
			No filters is what a run set out to cover. Whether the file then holds all of it is checked by
			<DeclarationLink name="bench_results_find_gaps" />, from the file alone:
		</p>
		<ul>
			<li>
				in every cell, each library of the roster that claims the cell's language has a value, or an
				entry in the excluded list for that cell
			</li>
			<li>every listed input of a timed language has a cell in each mode the file's cells use</li>
		</ul>
		<p>
			A file with no filters and a gap doesn't parse, whether it is a full run or a calibration, so
			a run that silently lost a library can't pass as complete. A filtered or smoke run lists what
			it has and may have gaps. Two things the file can't show are an input missing altogether and a
			whole mode missing: its inputs and modes are the ones that were measured, and only the corpus
			hash names the corpus they came from.
		</p>
		<p>
			A run that was stopped and resumed is a result like any other. <code>meta.run.segments</code>
			says how many stretches it was measured in, and its anchor covers every one of them, as
			<TomeLink slug="method" /> describes.
		</p>
		<p>
			<code>meta.commit</code> ends in <code>-dirty</code> when the working tree had changes the
			commit doesn't record, and such a run can't be reproduced from its commit.
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
			<li>
				every cell names a listed input, describes it as that entry does, and is named after its
				file and mode
			</li>
			<li>
				an input written for the benchmark has no provenance, a copied one has the hash its
				provenance pins, and one built from several files is marked synthetic
			</li>
			<li>
				a run with timed numbers records its anchor, and one with timed cells records how they were
				measured
			</li>
			<li>
				a run's filters describe the file: every cell is inside them, the libraries listed are
				exactly the ones filtered to, and no id repeats
			</li>
			<li>a smoke run carries no noise floor, allows no retries, and is one segment</li>
			<li>no value has more attempts than the run's retries allow</li>
			<li>a run with no filters has no gap, as above</li>
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
