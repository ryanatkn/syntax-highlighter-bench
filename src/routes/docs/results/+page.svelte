<script lang="ts">
	import TomeContent from '@fuzdev/fuz_ui/TomeContent.svelte';
	import TomeLink from '@fuzdev/fuz_ui/TomeLink.svelte';
	import ModuleLink from '@fuzdev/fuz_ui/ModuleLink.svelte';
	import DeclarationLink from '@fuzdev/fuz_ui/DeclarationLink.svelte';
	import TomeSection from '@fuzdev/fuz_ui/TomeSection.svelte';
	import TomeSectionHeader from '@fuzdev/fuz_ui/TomeSectionHeader.svelte';
	import { tome_get_by_slug } from '@fuzdev/fuz_ui/tome.ts';

	import { docs_data_context } from '$lib/docs_data.ts';

	const tome = tome_get_by_slug('results');

	const get_docs = docs_data_context.get();
	const docs = $derived(get_docs());
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
			<code>bench/run.ts</code> writes one for a timed run, as <TomeLink slug="method" /> describes,
			and <code>bench/deterministic.ts</code> writes the committed
			<code>results/deterministic.json</code>, which holds only the numbers that are the same on any
			machine, as <TomeLink slug="deterministic" /> describes.
			{#if docs.source === 'deterministic'}
				No timed run has been published yet, so that file is the one this site renders.
			{/if}
		</p>
	</section>
	<TomeSection>
		<TomeSectionHeader text="Sections" />
		<ul>
			<li>
				<DeclarationLink name="BenchMeta" /> — the machine, Node version, commit, and corpus hash;
				what kind of run it was and how it measured, in <DeclarationLink name="BenchRun" />, with
				the retries it allowed, how cold start was sampled, how many segments it was measured in,
				and the load average it started at; the roster of libraries with their versions and the
				color schemes their default themes cover; the excluded list for cells, and
				<code>startup_excluded</code> for cold-start scenarios, in
				<DeclarationLink name="BenchStartupExcluded" />; the anchor's drift; the machine's noise
				floor; the run's own process noise, in <DeclarationLink name="BenchProcessNoise" />, from
				every pair of a value's passes; what the bundle sizes were built with, and the compression
				levels every compressed size is taken at, in <DeclarationLink name="BenchBundler" />
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
				numbers. Its id is <code>&lt;file&gt;:&lt;mode&gt;</code>. A <code>tokenize</code> cell
				states the token counts and an <code>html</code> cell the output sizes, with the HTML's
				compressed sizes in <DeclarationLink name="BenchCellCompressed" />, so each is stated once
				for an input. Each value carries <code>attempts</code>: how many times the library was
				measured there, more than 1 when its rounds disagreed and it was retried. A retried value's
				spread and percentiles are those of the attempt that was kept. Each value also carries
				<code>pass_medians_ns</code>, the kept attempt's median for each pass, so the processes'
				disagreement can be recomputed from the file
			</li>
			<li>
				<DeclarationLink name="BenchStartup" /> — one cold-start scenario: what a fresh process
				loaded (<code>bare</code>, <code>core</code>, <code>lang</code>, <code>set</code>, or
				<code>first_highlight</code>), for which library, with which language or feature set, and
				whether as one bundled chunk. Its numbers are the median time since the process started, the
				10th and 90th percentile, the spread, how many samples were kept, and the processes' median
				peak resident size. The one <code>bare</code> entry, with no library, is the Node baseline
				every other entry includes
			</li>
			<li>
				<DeclarationLink name="BenchBundleEntry" /> — for each library over each feature set, its
				bundle sizes in <DeclarationLink name="BenchBundleSizes" />, or the languages of the set it
				lacks. The sizes are the JavaScript's, with the wasm and the theme CSS each measured apart
			</li>
			<li>
				<DeclarationLink name="BenchInstall" /> — for each library, what <code>npm install</code> of
				it adds: the packages of its runtime dependency closure, their files, those files' bytes,
				and a hash of the closure's <code>name@version</code> list
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
			sizes in each cell's <code>tokens</code>, <code>output</code>, and <code>compressed</code>,
			plus <code>bundle</code>, <code>install</code>, and <code>coverage</code>.
		</p>
		<p>
			A file may hold only the deterministic ones. It then has no <code>meta.run</code> and no
			anchor, and its <code>generated_at</code>, <code>machine</code>, <code>node</code>, and
			<code>commit</code> are null: they say where timed numbers came from, and are required as soon
			as a file has any. A timed run carries the deterministic numbers too, so one published file
			holds both.
		</p>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="Publishable or not" />
		<p>
			<code>meta.run</code> tells a publishable run from the rest. Its <code>kind</code> is
			<code>full</code>, <code>smoke</code>, or <code>calibrate</code>, and its <code>filters</code>
			are null unless the run was restricted to some libraries, languages, sizes, modes, sources, or
			metrics (the timed cells, or cold start). A smoke run's numbers mean nothing, and a
			calibration exists for its noise floor.
		</p>
		<p>
			<DeclarationLink name="bench_results_is_publishable" /> is the test for a result: a full run
			with no filters and no gap in its cells or its cold start, a stable anchor, a noise floor
			carried from the machine's calibration, and a commit that records everything that ran.
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
			A full run's cold start is checked the same way, by
			<DeclarationLink name="bench_results_find_startup_gaps" />. Each of these has an entry or an
			exclusion:
		</p>
		<ul>
			<li>the <code>bare</code> baseline</li>
			<li>
				for each library of the roster, unbundled and bundled: <code>core</code>; <code>lang</code>
				and <code>first_highlight</code> for every timed language it claims; and <code>set</code>
				for every feature set the file's cold start names whose languages it all claims
			</li>
		</ul>
		<p>
			A file with no filters and a gap doesn't parse, whether it is a full run or a calibration, so
			a run that silently lost a library can't pass as complete. A calibration measures no cold
			start, so only its cells are checked. A filtered or smoke run lists what it has and may have
			gaps. Two things the file can't show are an input missing altogether and a whole mode missing:
			its inputs and modes are the ones that were measured, and only the corpus hash names the
			corpus they came from. A third is a cold-start set missing altogether: the sets a
			<code>set</code> scenario covers are read from the file too, so a file with every
			<code>set</code> entry removed still reads as complete.
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
		<TomeSectionHeader text="What the site renders" />
		<p>
			The site is built from one results file, parsed through the schema when the site is built, so
			a malformed file fails the build and no number reaches a page unchecked:
		</p>
		<ul>
			<li>
				<code>results/latest.json</code>, the latest published timed run, when it is committed:
				<code>npm run results:publish</code> copies a run there once it passes the test below. It
				carries its own bundle sizes, install footprints, token counts, and output sizes, so every
				number on a page is from one file.
			</li>
			<li>
				otherwise <code>results/deterministic.json</code>. The pages then show the deterministic
				numbers, and say that no timed results are published where a timed number would be. A
				deterministic file that holds a timed number fails the build.
			</li>
		</ul>
		<p>
			A latest run must pass <DeclarationLink name="bench_results_is_publishable" />, or the build
			fails and says why. A smoke run, a calibration, a filtered run, a run with a gap, a run from a
			commit with uncommitted changes, a run whose anchor drifted, and a run with no noise floor are
			never shown as results. A drifted run is measured again, not published under a warning.
		</p>
		<p>
			A published run is also held against the deterministic file. When the two describe the same
			library versions, the same install closures, and the same corpus, their deterministic numbers
			must be equal: the feature sets, the coverage, the bundle sizes, the install footprints, and
			each cell's token counts and output sizes, raw and compressed. A difference fails the build
			and names the first place they differ. When a library's version, its dependencies, or the
			corpus has moved since the run, the run is shown as the snapshot it is, and the line that says
			where the numbers came from also says what has moved since.
		</p>
		<p>
			The fixture run the tests use holds invented numbers. A build renders it only when the
			<code>BENCH_RESULTS_FIXTURE</code> environment variable is <code>1</code>, which is for
			working on the pages before a run exists, and every page of such a build is marked as fixture
			data. A build without the variable never reads the file.
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
				a run with timed numbers records its anchor, when it started, and its machine, Node version,
				and commit, and how its numbers were measured
			</li>
			<li>
				token counts are on <code>tokenize</code> cells only and output sizes on <code>html</code>
				cells only, and a library with a timed value in a cell has that cell's deterministic number
			</li>
			<li>
				a value's 10th percentile is at most its 90th, and an anchor is stable exactly when its
				drift is under the threshold
			</li>
			<li>
				a run's filters describe the file: every cell and cold-start entry is inside them, the
				libraries listed are exactly the ones filtered to, and no id repeats
			</li>
			<li>a smoke run carries no noise floor, allows no retries, and is one segment</li>
			<li>no value has more attempts than the run's retries allow</li>
			<li>
				a value has a pass median for each of the run's passes, and the process noise is there
				exactly when a cell has a value and the run measured more than one pass, counting every pair
				of passes of every value, with its median at most its 95th percentile and that at most its
				largest
			</li>
			<li>a run with no filters has no gap, as above</li>
			<li>
				each startup entry carries the fields its scenario needs and no others, for languages the
				library claims, and appears once, as a number or as an exclusion and never both
			</li>
			<li>
				a <code>lang</code> or <code>first_highlight</code> entry names a timed language. A
				<code>set</code> entry names a feature set, which may hold an untimed one
			</li>
			<li>
				every startup entry keeps the samples the run says, its median lies between its 10th and
				90th percentile, and a calibration has none
			</li>
			<li>
				how cold start was sampled is recorded exactly when the run measured any, and is null for a
				calibration and for a run whose metrics filter leaves it out
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
			<li>
				bundle sizes cover every library over every set or are absent altogether, and what they were
				built with is recorded exactly when they are present
			</li>
			<li>
				the install footprints and the HTML's compressed sizes come with the bundle sizes: every
				library of the roster has a footprint, and every library with an output on an
				<code>html</code> cell has its compressed sizes, exactly when the bundle sizes are present.
				A footprint has at least a file for each package
			</li>
			<li>
				a compressed size is no larger than the raw one plus a compression format's own overhead,
				the HTML's included, and the theme CSS sizes are null exactly for a library that writes its
				styles inline
			</li>
			<li>
				a file with no timed numbers is complete: in every cell each library that claims the
				language has the number the cell states or is listed as excluded, and every listed input has
				a cell in each mode
			</li>
		</ul>
		<p>
			Use <DeclarationLink name="parse_bench_results" /> to validate a file and get every problem in
			one message.
		</p>
	</TomeSection>
</TomeContent>
