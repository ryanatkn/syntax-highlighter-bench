<script lang="ts">
	import TomeContent from '@fuzdev/fuz_ui/TomeContent.svelte';
	import TomeLink from '@fuzdev/fuz_ui/TomeLink.svelte';
	import DeclarationLink from '@fuzdev/fuz_ui/DeclarationLink.svelte';
	import TomeSection from '@fuzdev/fuz_ui/TomeSection.svelte';
	import TomeSectionHeader from '@fuzdev/fuz_ui/TomeSectionHeader.svelte';
	import { tome_get_by_slug } from '@fuzdev/fuz_ui/tome.ts';
	import Code from '@fuzdev/fuz_code/Code.svelte';

	const tome = tome_get_by_slug('method');

	const commands = `npm run bench -- --machine <name>            # a full run: results/<date>_<name>.json
npm run bench:calibrate -- --machine <name>  # the noise floor: results/calibration_<name>.json
npm run bench:smoke                          # everything once, briefly and in parallel
node bench/run.ts --langs ts --sizes small   # part of a run, to results/scratch/
node bench/run.ts --help`;
</script>

<TomeContent {tome}>
	<section>
		<p>
			The timed harness measures throughput: how long each library takes to tokenize an input, and
			to render it as HTML. <code>bench/run.ts</code> runs it and writes one
			<TomeLink slug="results" />. No run has been published, so there are no numbers yet.
		</p>
		<p>
			The method builds on the comparison harness of
			<a href="https://github.com/pngwn/twinkleplop">twinkleplop</a> (MIT), and the anchor workload
			is ported from it. It differs in giving each library a process of its own, where twinkleplop
			measures a cell's libraries together in one.
		</p>
	</section>
	<TomeSection>
		<TomeSectionHeader text="Cells" />
		<p>
			A cell is one input of the <TomeLink slug="corpus" /> in one mode, <code>tokenize</code> or
			<code>html</code>, measured across the libraries that claim its language. Its id is
			<code>&lt;file&gt;:&lt;mode&gt;</code>. A cell carries its input's source and size tier, so a
			reader can compare on the neutral inputs alone, or see whether a result holds on a library's
			home turf.
		</p>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="One process, one library" />
		<p>
			A process measures one library on one cell and loads no other. Every number is therefore one
			library alone in a fresh process, and the roster can't move it: adding or removing a library
			changes no other library's result.
		</p>
		<p>Two effects made that necessary, and both showed up as a library disagreeing with itself:</p>
		<ul>
			<li>
				Libraries that share code change how the JavaScript engine optimises that code for each
				other. Shiki's two engines share its tokenizer, and in one process the JavaScript engine
				measured far slower than it does alone.
			</li>
			<li>
				The engine sizes its young generation from what has been allocating. In a shared process a
				library's time on a large input depended on which libraries ran beside it.
			</li>
		</ul>
		<p>
			A cell is measured in passes. A pass is a process for every library, one after another, and
			the library a pass starts with changes from pass to pass and from cell to cell. The same code
			can settle at a slightly different speed from one process to the next, so a library's number
			pools the rounds of all its passes.
		</p>
		<p>
			The engine runs with its defaults, which is what a consumer gets. One process runs at a time,
			and the parent does nothing while it measures: it blocks on the child and reads its output
			after it exits.
		</p>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="Inside a process" />
		<p>Each step answers a way a simple timing loop goes wrong:</p>
		<ul>
			<li>
				<strong>One language loaded.</strong> The library sets up exactly the cell's language, once,
				before anything is timed. See <TomeLink slug="adapters" /> for what that means for Markdown.
			</li>
			<li>
				<strong>The output is checked first.</strong> The library must pass the output check on the
				language's harness snippet and then on the cell's input. A library that fails is recorded as
				excluded with the reason, and is not timed.
			</li>
			<li>
				<strong>Iterations calibrated for the library.</strong> Speeds differ by orders of
				magnitude, so a batch makes the number of calls that fills the target duration. A batch
				makes at least a few calls while they fit a cap, and a call too long for that is measured
				once per batch.
			</li>
			<li>
				<strong>
					A full collection, a rewarm, and a minor collection before every timed batch.
				</strong>
				The full collection means a batch inherits no garbage from the one before it. A forced
				collection leaves code cold, so the library then runs untimed, and a minor collection clears
				what the rewarm allocated, so that collection doesn't land inside the batch.
			</li>
			<li>
				<strong>Results are kept and counted.</strong> A batch keeps its last result, and after the
				clock stops that result is counted. A count that differs from the checked one fails the
				cell: a tokenizer that silently stops early on a slow line must not be averaged in as a fast
				one.
			</li>
			<li>
				<strong>The HTML is read.</strong> Some libraries return a string the engine hasn't joined
				up yet, which costs little to build, and every consumer then pays to flatten it on first
				use. In <code>html</code> mode the timed call reads one character of the string, for every
				library, so that cost is inside the clock. It is free for a library whose string is already
				flat. In <code>tokenize</code> mode every library returns finished arrays, so there is
				nothing to force.
			</li>
		</ul>
		<p>
			The collections need the process started with <code>--expose-gc</code>, which
			<code>bench/run.ts</code> passes to each process.
		</p>
		<p>
			A full run measures each library in 3 processes per cell, each timing 4 rounds of 20ms
			batches, after a 100ms warmup, with a 100ms rewarm before each batch.
		</p>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="What each number means" />
		<p>
			Each library's numbers in a cell are a <DeclarationLink name="BenchCellValue" />:
		</p>
		<table>
			<thead>
				<tr>
					<th>number</th>
					<th>meaning</th>
				</tr>
			</thead>
			<tbody>
				<tr>
					<td><code>ns_per_op</code></td>
					<td>nanoseconds per call: the median across the rounds of every pass</td>
				</tr>
				<tr>
					<td><code>ops_per_sec</code>, <code>mb_per_sec</code></td>
					<td>
						the same time as calls per second, and as megabytes of input per second, which is the
						one to compare across inputs of different sizes
					</td>
				</tr>
				<tr>
					<td><code>p10_ns</code>, <code>p90_ns</code></td>
					<td>the 10th and 90th percentile across those rounds</td>
				</tr>
				<tr>
					<td><code>spread</code></td>
					<td>
						the slowest round over the fastest, across passes as well as within them. Near 1 means
						they agreed, and a high spread says the cell was disturbed or the processes disagreed
					</td>
				</tr>
				<tr>
					<td><code>iterations</code></td>
					<td>
						calls per batch. Each process calibrates for itself, and this is the median across them
					</td>
				</tr>
				<tr>
					<td><code>rss_peak_bytes</code></td>
					<td>the peak resident size of the library's process, the largest across its passes</td>
				</tr>
			</tbody>
		</table>
		<p>
			The token count and the size of the HTML come from the output check, under the same setup and
			outside the clock. Libraries split the same source differently, so a token count is the
			library's own and is recorded rather than equalised.
		</p>
		<p>
			<code>rss_peak_bytes</code> is a whole process: Node itself, the library as its adapter
			imports it, with one language set up, and the input. It is not what the library adds to a
			page, and most of it is the same for every library. Compare it between libraries on the same
			cell.
		</p>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="Kinds of run" />
		<p>
			A results file says what kind of run produced it, in <DeclarationLink name="BenchRun" />, with
			the passes, the rounds, the durations, and any filters:
		</p>
		<ul>
			<li>
				<code>full</code> — the real measurement. Only a full run with no filters is publishable.
			</li>
			<li>
				<code>smoke</code> — every library on every cell, in one process each, for one round of the
				shortest batches, with several processes running at a time. It proves the harness and every
				adapter work, and its numbers mean nothing.
			</li>
			<li><code>calibrate</code> — measures the machine's noise floor, described below.</li>
		</ul>
		<Code lang="bash" content={commands} />
		<table>
			<thead>
				<tr>
					<th>flag</th>
					<th>what it does</th>
				</tr>
			</thead>
			<tbody>
				<tr>
					<td><code>--smoke</code></td>
					<td>a smoke run</td>
				</tr>
				<tr>
					<td><code>--calibrate</code></td>
					<td>a calibration run</td>
				</tr>
				<tr>
					<td>
						<code>--libraries</code>, <code>--langs</code>, <code>--sizes</code>,
						<code>--modes</code>, <code>--sources</code>
					</td>
					<td>
						measure only these, as comma-separated ids. An unknown id is an error, not an empty run
					</td>
				</tr>
				<tr>
					<td><code>--passes</code>, <code>--rounds</code>, <code>--target-ms</code></td>
					<td>
						how many processes measure each library on a cell, how many batches each times, and how
						long a batch aims to run
					</td>
				</tr>
				<tr>
					<td><code>--machine</code></td>
					<td>
						the name the machine is recorded under. Required for an unfiltered full or calibration
						run; otherwise the hostname
					</td>
				</tr>
				<tr>
					<td><code>--out</code></td>
					<td>where to write the results file instead</td>
				</tr>
				<tr>
					<td><code>--help</code></td>
					<td>print the flags</td>
				</tr>
			</tbody>
		</table>
		<p>
			A full run with no filters is written to <code>results/</code>, named by its UTC date and
			machine, and it won't overwrite a run already there. A smoke run or a filtered one is written
			to <code>results/scratch/</code>, which git ignores, so it can't be committed as if it were a
			result. A failed process fails the run, and nothing is written.
		</p>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="The noise floor" />
		<p>
			Before a machine's numbers are trusted, it is calibrated. A calibration measures every library
			as if it were two libraries: each gets twice the passes, split alternately into two arms, and
			each arm is exactly what a full run would measure. The two arms should be equal. How far apart
			they are is what the machine and the method produce when nothing differs, including what
			varies from one process to the next. <DeclarationLink name="BenchNoiseFloor" /> holds two
			numbers:
		</p>
		<ul>
			<li>
				<code>per_cell</code> is the 95th percentile of that difference, across cells and libraries.
				A difference between two libraries in one cell that is smaller than this is not a result.
			</li>
			<li>
				<code>geomean</code> takes each library's two geometric means over all cells, and is their
				difference for the library where it was largest.
			</li>
		</ul>
		<p>
			A difference is the larger time over the smaller, less one, so it reads the same whichever arm
			was slower.
		</p>
		<p>
			A calibration is written to <code>results/calibration_&lt;machine&gt;.json</code>. A later
			full run copies its noise floor if the calibration describes that run: unfiltered, with a
			stable anchor, and on the same machine name, CPU, governor, Node version, corpus, and
			parameters. Otherwise the run records no noise floor and says why.
		</p>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="The anchor" />
		<p>
			A run measures a fixed reference workload before its first process and after its last. The
			workload involves no measured library, so a change between the two readings is the machine
			changing state: heat, frequency scaling, another program. <code>drift</code> is the relative
			change, in <DeclarationLink name="BenchAnchor" />, and a run is <code>stable</code> while it
			stays under 3%.
		</p>
		<p>
			The anchor only brackets the run. Something that disturbed the middle of it shows as a high
			<code>spread</code>, and the summary a run prints lists every library whose rounds on a cell
			disagreed.
		</p>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="One run at a time" />
		<p>
			Two measurement runs at once make each other wrong, not just noisy. A run takes a machine-wide
			lock, a file in the OS temp directory that names its process, and holds it until its results
			are ready to write. A second run is refused and told who holds the lock. A lock whose process
			is gone is taken over.
		</p>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="Caveats" />
		<ul>
			<li>
				<strong>Classes and inline styles.</strong> Shiki resolves colors while it tokenizes and
				writes them inline, and the other libraries emit class names that a stylesheet colors. The
				<code>html</code> mode measures what each library ships, which is not the same work.
			</li>
			<li>
				<strong>Token counts differ.</strong> A library that emits fewer tokens for the same source
				is doing less work for each byte, not the same work faster.
			</li>
			<li>
				<strong>Synchronous paths.</strong> A library with an async API loads in its setup and is
				timed through its synchronous core.
			</li>
			<li>
				<strong>Steady state.</strong> Every library is warm when it is timed. What a first call
				costs is cold start, which is a separate measurement and not built.
			</li>
			<li>
				<strong>Forced collections.</strong> Every batch follows a forced collection and a rewarm.
				Shiki recovers from a forced collection more slowly than the other libraries; at 100ms its
				times read a few percent high.
			</li>
			<li>
				<strong>Measured alone.</strong> A page that loads several highlighters, or a busy
				application, gives the engine a different history than a process holding one library.
			</li>
		</ul>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="Reproducing a run" />
		<p>
			A results file records the commit, the Node version, the machine, the corpus hash, and every
			library's version. From a checkout of that commit, <code>npm ci</code> installs the same
			versions, and the command for the kind of run measures it again. The deterministic numbers
			come out the same anywhere. The timed ones depend on the machine, so compare the ratios
			between libraries rather than the times.
		</p>
		<p>
			A quiet machine matters more than a fast one: close other programs, and prefer a fixed CPU
			frequency governor. Before trusting a run, check that its anchor is stable, that
			<code>spread</code> is near 1 for every library in every cell, and that nothing unexpected is
			excluded. <code>bench/run.ts</code> prints all three when it finishes.
		</p>
	</TomeSection>
</TomeContent>
