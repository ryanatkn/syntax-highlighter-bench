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
npm run bench -- --machine <name> --plan     # what a run would do, measuring nothing
npm run bench -- --machine <name> --resume   # continue a run that was stopped
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
				library, so that cost is inside the clock. It depends on the size of the output, not on the
				library, so it weighs most on the fastest one, and it is free for a library whose string is
				already flat. In <code>tokenize</code> mode every library returns finished arrays, so there
				is nothing to force.
			</li>
		</ul>
		<p>
			The collections need the process started with <code>--expose-gc</code>, which
			<code>bench/run.ts</code> passes to each process.
		</p>
		<p>
			A full run measures each library in 3 processes per cell, each timing 4 rounds of 20ms
			batches, after a 100ms warmup, with a 300ms rewarm before each batch.
		</p>
		<p>
			The rewarm is longer than the warmup on purpose. A forced collection leaves code cold, and
			libraries recover from it at different speeds, Shiki more slowly than the others. A library
			still recovering when its batch is timed reads slow, so the rewarm is long enough that every
			library in the roster has recovered.
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
				<tr>
					<td><code>attempts</code></td>
					<td>
						how many times the library was measured on the cell: 1 unless it was retried, as
						described below
					</td>
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
				<code>full</code> — the real measurement. Only a full run with no filters is publishable,
				and such a file must be whole: every library has a number or an exclusion in every cell
				whose language it claims.
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
					<td><code>--retries</code></td>
					<td>
						how many times a library whose rounds on a cell disagreed is measured again there. 0
						turns it off
					</td>
				</tr>
				<tr>
					<td><code>--resume</code></td>
					<td>continue the run its journal records, which must be this same run</td>
				</tr>
				<tr>
					<td><code>--plan</code></td>
					<td>
						print what the run would measure, where it would write, and an estimate of how long it
						would take, and measure nothing
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
			A full run with no filters is written to <code>results/</code>, named by the UTC date it
			started and its machine, and it won't overwrite a run already there. A smoke run or a filtered
			one is written to <code>results/scratch/</code>, which git ignores, so it can't be committed
			as if it were a result. A failed process fails the run, and no results file is written.
		</p>
		<p>
			<code>--plan</code> makes every check a run makes before it measures, then prints the cells,
			libraries, and processes, the parameters, where the results and the journal would go, and an
			estimate of the time, worked out from the parameters and not measured. It is refused where the
			run would be.
		</p>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="Stopping and resuming" />
		<p>
			A full run is one process for each library, pass, and cell, one at a time, so it is long, and
			a calibration is twice as long. A timed run keeps a journal beside its results file: each
			process's result is appended and synced to disk before the next process starts. The parent
			writes only between processes, never while one is measuring. When a run stops, whether by a
			signal, a failed process, or a crash, the journal stays, and <code>--resume</code> continues
			the run from it.
		</p>
		<ul>
			<li>
				<strong>What is recorded.</strong> A first line describing the run, then for each stretch of
				measuring, a segment, its opening anchor reading, one line for every process result, and its
				closing anchor reading.
			</li>
			<li>
				<strong>What must match.</strong> The kind of run, its parameters and filters, the corpus
				hash, every library's version, the machine's name, CPU, and governor, the OS release, the
				Node version, the <code>NODE_OPTIONS</code> the processes inherit, and the commit with its
				dirty marker. A resume with any of them different is refused, naming what differs, so
				results from two setups are never mixed. With a dirty working tree the journal can't tell
				whether the uncommitted changes are the ones it started with, and a resume says so.
			</li>
			<li>
				<strong>Never by accident.</strong> A journal already there stops a run that wasn't given
				<code>--resume</code>: it is neither overwritten nor continued until you say which, and the
				refusal says what run the journal records. A journal holding a result the run would never
				ask for is refused too.
			</li>
			<li>
				<strong>Never after an overlap.</strong> A run that lost the machine lock sets its journal
				aside as <code>&lt;journal&gt;.overlapped</code>, since another run may have overlapped it.
				It writes no results, and the journal can't be resumed.
			</li>
			<li>
				<strong>What is skipped.</strong> The processes the journal holds are not run again. The
				rest run in the order planned, and the results are assembled exactly as an uninterrupted run
				assembles them.
			</li>
			<li>
				<strong>What the file says.</strong> <code>segments</code>, in
				<DeclarationLink name="BenchRun" />, counts the stretches the run was measured in: 1 for an
				uninterrupted run. <code>generated_at</code>, and the date in a full run's file name, are
				when the first segment started. <code>duration_ms</code> is the time spent measuring,
				without the time between segments.
			</li>
			<li>
				<strong>A crash in the middle of a write.</strong> A last line with no newline is a write
				that didn't finish. It is dropped, and that process is measured again. A complete line that
				isn't a journal line is not a crash, and the journal is refused.
			</li>
		</ul>
		<p>
			The journal is removed once the results file is written. A smoke run is short and keeps none.
		</p>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="Retries" />
		<p>
			A library whose rounds on a cell are far apart was disturbed by something: another program, or
			its own processes disagreeing. Once a cell's passes are done, a timed run measures each
			library whose <code>spread</code> there is over 1.25 again, every pass of it, up to
			<code>--retries</code> more times (2 by default) and until an attempt is under the threshold.
		</p>
		<p>
			The attempt kept is the one with the lowest spread, the earliest if they tie. It is never
			chosen by its time. Keeping the fastest attempt would pull every retried number toward fast,
			and would favour a noisier library, which is retried more often. Choosing on agreement alone
			takes the measurement that was least disturbed, whichever way it moved the number.
		</p>
		<p>
			<code>attempts</code> records how many times a library was measured on a cell, so the numbers
			that needed a retry can be told from the rest. A retried value's spread and percentiles are
			those of the attempt that was kept, so they describe its calmest attempt, not everything that
			was measured, and <code>attempts</code> is what marks it. The summary a run prints counts the
			retried cells of each library, and lists the library-cells still over the threshold after the
			last attempt. What should be the same every time, the token count, the output size, and
			whether the library passed the check, must agree across attempts as it must across passes, or
			the run fails at that cell.
		</p>
		<p>A smoke run doesn't retry.</p>
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
			parameters, retries included. Otherwise the run records no noise floor and says why.
		</p>
		<p>
			A calibration retries too, each arm of a library on its own and by the same rule, so an arm
			stays exactly what a full run would measure and the floor describes a full run with the same
			retries. The rule looks only at an arm's own rounds, never at how far apart the two arms are,
			so it can't steer the floor. A calibration file's values are the first arm's, and so are their
			<code>attempts</code>.
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
		<p>
			A run that was stopped and resumed takes a reading at the start and end of every segment, and
			its drift is that of the two readings furthest apart. A machine that changed state between
			segments, or within one, is then flagged and not hidden by readings that happen to agree at
			the two ends. A segment stopped by a signal or a failed process still takes its closing
			reading. One that was killed outright can't, and the next segment's opening reading stands in
			for it.
		</p>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="One run at a time" />
		<p>
			Two measurement runs at once make each other wrong, not just noisy. A run takes a machine-wide
			lock, a file in the OS temp directory that names its process, and holds it for as long as it
			measures, as does each segment of a resumed run. A second run is refused and told who holds
			the lock. A lock whose process is gone is taken over.
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
				<strong>Forced collections.</strong> Every batch follows a forced collection and a rewarm,
				so a library is timed just after it has recovered from one, which is not how every
				application runs it.
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
			excluded. <code>bench/run.ts</code> prints all three when it finishes, with how many
			library-cells were retried and whether the run was resumed.
		</p>
	</TomeSection>
</TomeContent>
