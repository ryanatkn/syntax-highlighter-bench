import{D as e,F as t,G as n,L as r,M as i,Q as a,_t as o,at as s,ft as c,it as l,nt as u,pt as d,rt as f,ut as p,vt as m,z as h}from"./DkH4oS7D.js";import{n as g}from"./CgTomG9E.js";import{t as _}from"./nh1l0Fcz.js";import{t as v}from"./0Yij4SCe.js";import{t as y}from"./DUbKxgKz.js";import{t as b}from"./D0z3YJp3.js";import{n as x,t as S}from"./D_vySp7z.js";import{t as C}from"./IGuC_Li3.js";import{s as w}from"./D7Bsffq_.js";var T=r(`<!> <p>A cell is one input of the <!> in one mode, <code>tokenize</code> or <code>html</code>, measured across the libraries that claim its language. Its id is <code>&lt;file&gt;:&lt;mode&gt;</code>. A cell carries its input's source and size tier, so a
			reader can compare on the neutral inputs alone, or see whether a result holds on a library's
			home turf or on the stress inputs.</p>`,1),ee=r(`<!> <p>A process measures one library on one cell and loads no other. Every number is therefore one
			library alone in a fresh process, and the roster can't move it: adding or removing a library
			changes no other library's result.</p> <p>Two effects made that necessary, and both showed up as a library disagreeing with itself:</p> <ul><li>Libraries that share code change how V8 optimizes that code for each other. Shiki's two
				engines share its tokenizer, and beside the wasm engine Shiki's JS engine measured far
				slower than it does alone.</li> <li>V8 sizes its young generation from recent allocation. In a shared process a library's time
				on a large input depended on which libraries ran beside it.</li></ul> <p>A cell is measured in passes. A pass is a process for every library, one after another, and
			the library a pass starts with changes from pass to pass and from cell to cell. The same code
			can settle at a slightly different speed from one process to the next, so a library's number
			pools the rounds of all its passes.</p> <p>Node runs with its default flags, which is what a consumer gets, apart from <code>--expose-gc</code>, which the forced minor collection below needs. In a timed run one
			process runs at a time, and the parent does nothing while it measures: it blocks on the child
			and reads its output after it exits.</p>`,1),te=r(`<!> <p>Each step answers a way a simple timing loop goes wrong:</p> <ul><li><strong>One language loaded.</strong> The library sets up exactly the cell's language, once,
				before anything is timed. See <!> for what that means for Markdown.</li> <li><strong>The output is checked first.</strong> The library must pass the output check on the
				language's harness snippet and then on the cell's input. A library that fails is recorded as
				excluded with the reason, and is not timed.</li> <li><strong>Iterations calibrated for the library.</strong> Speeds differ by orders of
				magnitude, so a batch makes the number of calls that fills the target duration: at least a
				few while they fit under a cap, as many as fit when fewer do, and one when two don't.</li> <li><strong>A rewarm and a minor collection before every timed batch.</strong> The library runs
				untimed until it is back to speed, and a minor collection then clears what the rewarm
				allocated, so the collection it would cause doesn't land inside the batch. No full
				collection is forced between batches. One forced before every batch puts some libraries
				through a race each round: it can discard optimized code whose hidden classes only
				short-lived objects hold, so the library re-optimizes inside the clock, and it re-rolls how
				memory a library allocates outside the JS heap is reused, so a process settles at one of two
				speeds. A minor collection does neither.</li> <li><strong>Results are kept and counted.</strong> A batch keeps its last result, and after the
				clock stops that result is counted. A count that differs from the checked one fails the
				cell: a tokenizer that silently stops early on a slow line must not be averaged in as a fast
				one.</li> <li><strong>The HTML is read.</strong> Some libraries return a string the engine hasn't joined
				up yet, which costs little to build, and every consumer then pays to flatten it on first
				use. In <code>html</code> mode the timed call reads one character of the string, for every
				library, so that cost is inside the clock. It depends on the size of the output, not on the
				library, so it weighs most on the fastest one, and it is free for a library whose string is
				already flat. In <code>tokenize</code> mode every library returns finished arrays, so there
				is nothing to force.</li></ul> <p>A full run measures each library in 3 processes per cell, each timing 4 rounds of 20ms
			batches, after a 100ms warmup, with a 300ms rewarm before each batch. A library whose one call
			takes at least as long as the rewarm gets none: the batch before keeps it warm, and a rewarm
			would only repeat that call.</p> <p>The rewarm is longer than the warmup on purpose. The engine still runs full collections of its
			own during a run, and one can leave code cold. Libraries recover from that at different
			speeds, Shiki more slowly than the others, and a library still recovering when its batch is
			timed reads slow, so the rewarm is long enough that every library in the roster has recovered.</p>`,1),E=r(`<!> <p>Each library's numbers in a cell are a <!>:</p> <table><thead><tr><th>number</th><th>meaning</th></tr></thead><tbody><tr><td><code>ns_per_op</code></td><td>nanoseconds per call: the median across the rounds of every pass</td></tr><tr><td><code>ops_per_sec</code>, <code>mb_per_sec</code></td><td>the same time as calls per second, and as megabytes of input per second, which is the
						one to compare across inputs of different sizes</td></tr><tr><td><code>p10_ns</code>, <code>p90_ns</code></td><td>the 10th and 90th percentile across those rounds</td></tr><tr><td><code>spread</code></td><td>the slowest round over the fastest, across passes as well as within them. Near 1 means
						they agreed, and a high spread says the cell was disturbed or the processes disagreed</td></tr><tr><td><code>pass_medians_ns</code></td><td>each pass's own median over its rounds, in pass order: one number per process, so how
						far the processes disagreed can be read apart from the rounds</td></tr><tr><td><code>iterations</code></td><td>calls per batch. Each process calibrates for itself, and this is the median across them</td></tr><tr><td><code>rss_peak_bytes</code></td><td>the peak resident size of the library's process, the largest across its passes</td></tr><tr><td><code>attempts</code></td><td>how many times the library was measured on the cell: 1 unless it was retried, as
						described below</td></tr></tbody></table> <p>The token count and the size of the HTML come from the output check, under the same setup and
			outside the clock. Libraries split the same source differently, so a token count is the
			library's own and is recorded rather than equalised. Each is stated once for an input: the
			token count on its <code>tokenize</code> cell and the output size on its <code>html</code> cell. <!> describes them, and the bundle sizes a run carries.</p> <p><code>rss_peak_bytes</code> is a whole process: Node itself, the harness, the library as its
			adapter imports it, with one language set up, and the input. It is not what the library adds
			to a page, and most of it is the same for every library. Compare it between libraries on the
			same cell. On a small input it says little about footprint: a process warms up and is timed
			for a fixed duration, so its peak follows how much the library allocated in that time more
			than what it holds. What a library holds is the retained heap, described in <!>.</p>`,1),D=r(`<!> <p>A timed cell measures a library that is already loaded and warm. Cold start measures the other
			end: a fresh Node process that loads the library and does one thing, once. Each sample is one
			process, and each <!> entry is a scenario:</p> <table><thead><tr><th>scenario</th><th>what the process does</th></tr></thead><tbody><tr><td><code>bare</code></td><td>nothing: the Node baseline, with no library, which every other time includes</td></tr><tr><td><code>core</code></td><td>imports the library with no language</td></tr><tr><td><code>lang</code></td><td>imports the library with one language, for each timed language it claims</td></tr><tr><td><code>set</code></td><td>imports the library with the languages of the <code>docs</code> feature set: what a
						documentation site loads</td></tr><tr><td><code>first_highlight</code></td><td>imports the library with one language and highlights that language's harness snippet
						once, to HTML: the time to a first highlight, for each timed language it claims</td></tr></tbody></table> <p><strong>What is imported</strong> is the module the adapter's <code>bundle_entry</code> writes
			for a feature set (<code>core</code>, <code>single:&lt;lang&gt;</code>, <code>docs</code>):
			the same module bundle size is measured over, so a time and a size describe one thing. The
			adapter modules themselves are never loaded here. Some of them import every language, which
			would charge a library for languages the scenario doesn't load. A first highlight makes the
			call the adapter documents for that module (<code>bundle_html_source</code>), and the check of
			every built bundle confirms it returns the same HTML as <code>bundle_html</code>.</p> <p><strong>Two forms</strong> of every scenario, apart from <code>bare</code>:</p> <ul><li><code>bundled</code> — the built chunk whose size <!> reports,
				imported as one file. A library's wasm import stays outside its bundle, as it does for the
				size, so that one module still loads from the package.</li> <li>unbundled — the same module's source, written to a file under <code>node_modules/.cache/</code> in the checkout and imported from there. Node resolves
				each package from the checkout's <code>node_modules</code> and loads every file the library
				reaches, as a consumer without a bundler does.</li></ul> <p>The gap between the two is Node finding, reading, and compiling many files in place of one,
			and code the bundler removed, which a bundled page or server doesn't pay. Read the form that
			matches how the library would be shipped.</p> <p><strong>Start is the start of the process, by its own clock.</strong> The process reads <code>performance.now()</code> once, when its work is done, and Node counts that from the
			moment the process began. So a time includes Node itself starting up, and leaves out what
			happens outside the process: the parent creating it, the OS loading the Node binary, and the
			exit. A clock in the parent would add those, with their own variance. The <code>bare</code> scenario is the same process with nothing imported, so a scenario's time less <code>bare</code>'s is what the library added.</p> <p><strong>The process is a consumer's.</strong> It runs a generated module holding the import,
			the one call of a first highlight, and a few lines that report, with no harness code and no
			flags: no <code>--expose-gc</code>, which only the timed cells use. The source a first
			highlight is given is a literal in that module, so no file is read inside the clock, and one
			character of the HTML is read before the clock stops, as the timed cells do, so a string the
			engine hasn't joined up is paid for.</p> <p><strong>The compile cache is off.</strong> V8 can keep compiled code on disk between
			processes, and Node uses that only when asked. A second process would then skip compiling what
			it loads, and would not be cold. Every cold-start process runs with <code>NODE_DISABLE_COMPILE_CACHE=1</code> and without <code>NODE_COMPILE_CACHE</code>, each
			sample reports that no cache directory is in use, and <code>startup_compile_cache</code> in <!> records it.</p> <p><strong>Interleaved rounds.</strong> A round runs every scenario once, one process at a time,
			with the parent blocked on each. The scenarios that differ only in the library run one after
			another, and the library that goes first rotates from round to round and from scenario to
			scenario. Because every round holds every scenario, a machine that slows down partway slows a
			sample of each of them, and not the scenarios that happened to come last.</p> <p><strong>The first rounds are discarded.</strong> They bring every file a scenario reads into
			the OS page cache, which a machine pays once and not at every start. A full run keeps 20
			samples of each scenario, after 3 discarded rounds.</p> <p><strong>Each scenario is checked by its first process.</strong> The import has to work and the
			module has to export something, and a first highlight's HTML has to pass the same check on the
			harness snippet that a timed cell applies. A library that fails is recorded in <code>startup_excluded</code> with the reason, and has no number there: this is how a library
			that can't be imported outside a bundler would show. A process that was ended, by a signal or
			an abort, did not fail on its own: that fails the run, which can be resumed, and excludes
			nothing. A scenario over languages a library doesn't claim is unsupported, and is never run.
			Every later sample must agree with the first, and when the run carries the deterministic
			results, a first highlight's HTML must be the size they have for that library on that snippet.</p> <table><thead><tr><th>number</th><th>meaning</th></tr></thead><tbody><tr><td><code>samples</code></td><td>how many processes were kept</td></tr><tr><td><code>median_ms</code></td><td>the median across them, in milliseconds since the process started</td></tr><tr><td><code>p10_ms</code>, <code>p90_ms</code></td><td>the 10th and 90th percentile</td></tr><tr><td><code>spread</code></td><td>the slowest sample over the fastest. A process start has a long slow tail, so this is
						wider than a cell's, and the percentiles say more</td></tr><tr><td><code>rss_peak_bytes</code></td><td>the median peak resident size of those processes, read when the clock stopped</td></tr></tbody></table> <p><strong>Memory.</strong> A cold-start process has loaded the library and done nothing else, so
			its peak resident size is closer to a footprint than a timed cell's. It is still a whole
			process, most of it Node: subtract the <code>bare</code> entry's. What is left is the code and
			data the library loaded, and for a first highlight what one call allocated, at the sizes the
			engine chose for a process of that age. The retained heap, described in <!>, is the steadier figure for what a library holds: read after
			collecting garbage, less a bare process's, and the same from one process to the next within a
			small tolerance.</p> <p><strong>Nothing is retried.</strong> A disturbance lands on one sample of every scenario, not
			on one scenario, and the median over many processes sets a slow one aside. Sampling one
			scenario again later would also take it out of the rounds that make the scenarios comparable.
			There is no noise floor for cold start either: a calibration measures the timed cells only.
			Without one, the bare baseline's own <code>p10_ms</code> to <code>p90_ms</code> band is the
			guide. It is how far two single processes are apart, and a median of many samples is steadier
			than one, so the results page scales it down to what a difference of two medians can be off
			by, and marks a smaller addition as in the noise.</p> <p><strong>Part of the run.</strong> The cold-start processes follow the cells in the same run:
			under the same machine lock, between the same anchor readings, in the same journal, and
			written to the same results file. A smoke run takes one sample of every scenario.</p>`,1),O=r(`<!> <p>A results file says what kind of run produced it, in <!>, with
			the passes, the rounds, the durations, and any filters:</p> <ul><li><code>full</code> — the real measurement. Only a full run with no filters is publishable,
				and such a file must be whole: every library has a number or an exclusion in every cell
				whose language it claims, and in every cold-start scenario it supports, in both forms.</li> <li><code>smoke</code> — every library on every cell, in one process each, for one round of the
				shortest batches, then one sample of every cold-start scenario, with several processes
				running at a time. It proves the harness and every adapter work, and its numbers mean
				nothing.</li> <li><code>calibrate</code> — measures the machine's noise floor, described below. It measures
				the cells only, and no cold start.</li></ul> <!> <table><thead><tr><th>flag</th><th>what it does</th></tr></thead><tbody><tr><td><code>--smoke</code></td><td>a smoke run</td></tr><tr><td><code>--calibrate</code></td><td>a calibration run</td></tr><tr><td><code>--libraries</code>, <code>--langs</code>, <code>--sizes</code>, <code>--modes</code>, <code>--sources</code></td><td>measure only these, as comma-separated ids. An unknown id is an error, not an empty run. <code>--libraries</code> and <code>--langs</code> narrow the cold-start scenarios too;
						the other three select inputs, which cold start has none of</td></tr><tr><td><code>--metrics</code></td><td>measure only <code>throughput</code> (the timed cells) or only <code>startup</code> (cold start). Both by default. Naming both is no filter, and neither is <code>throughput</code> on a calibration, which measures nothing else</td></tr><tr><td><code>--passes</code>, <code>--rounds</code>, <code>--target-ms</code></td><td>how many processes measure each library on a cell, how many batches each times, and how
						long a batch aims to run</td></tr><tr><td><code>--retries</code></td><td>how many times a library whose rounds on a cell disagreed is measured again there. 0
						turns it off</td></tr><tr><td><code>--startup-samples</code></td><td>how many fresh processes sample each cold-start scenario, after the discarded rounds</td></tr><tr><td><code>--resume</code></td><td>continue the run its journal records, which must be this same run</td></tr><tr><td><code>--plan</code></td><td>print what the run would measure, where it would write, and an estimate of how long it
						would take, and measure nothing</td></tr><tr><td><code>--machine</code></td><td>the name the machine is recorded under. Required for an unfiltered full or calibration
						run; otherwise the hostname</td></tr><tr><td><code>--out</code></td><td>where to write the results file instead</td></tr><tr><td><code>--help</code></td><td>print the flags</td></tr></tbody></table> <p>A full run with no filters is written to <code>results/</code>, named by the UTC date it
			started and its machine, and it won't overwrite a run already there. A smoke run or a filtered
			one is written to <code>results/scratch/</code>, which git ignores, so it can't be committed
			as if it were a result. A cell process that fails, or any process ended by a signal, fails the
			run, and no results file is written; the journal keeps what was measured.</p> <p><code>--plan</code> makes every check a run makes before it measures, then prints the cells,
			libraries, and processes, the cold-start scenarios with the processes they add and any a
			library is unsupported for, the parameters, where the results and the journal would go, and an
			estimate of the time, worked out from the parameters and not measured. It is refused where the
			run would be.</p>`,1),k=r(`<!> <p>A full run is one process for each library, pass, and cell, then one for each sample of each
			cold-start scenario, one at a time, so it is long, and a calibration's cells take twice as
			long. A timed run keeps a journal beside its results file: each process's result is appended
			and synced to disk before the next process starts. The parent writes only between processes,
			never while one is measuring. When a run stops, whether by a signal, a failed process, or a
			crash, the journal stays, and <code>--resume</code> continues the run from it.</p> <ul><li><strong>What is recorded.</strong> A first line describing the run, then for each stretch of
				measuring (a segment) a line with its opening anchor reading and load average, one line for
				every process result, a cell's or a cold-start sample's, and a line with its closing anchor
				reading.</li> <li><strong>What must match.</strong> The kind of run, its parameters and filters, the corpus
				hash, every library's version and extra packages, the machine's name, CPU, threads, and
				frequency settings (governor, driver, energy-performance preference, and boost), the OS
				release, the Node version, the <code>NODE_OPTIONS</code> the processes inherit, and the
				commit with its dirty marker. A resume with any of them different is refused, naming what
				differs, so results from two setups are never mixed. With a dirty working tree the journal
				can't tell whether the uncommitted changes are the ones it started with, and a resume says
				so.</li> <li><strong>Nothing installed mid-run.</strong> Every cell process reports the versions of its
				library's packages it found installed, and one that differs from what the run was planned
				with stops the run, naming the package and both versions, before its result is journaled.
				Cold-start processes report none, so the run reads the versions again before writing its
				file, and on a change writes nothing and sets the journal aside as <code>&lt;journal&gt;.changed</code>: its cold-start samples were never checked against the
				change, so the run starts over.</li> <li><strong>Never by accident.</strong> A journal already there stops a run that wasn't given <code>--resume</code>: it is neither overwritten nor continued until you say which, and the
				refusal says what run the journal records. A journal holding a result the run would never
				ask for is refused too.</li> <li><strong>Never after an overlap.</strong> A run that lost the machine lock sets its journal
				aside as <code>&lt;journal&gt;.overlapped</code>, since another run may have overlapped it.
				It writes no results, and the journal can't be resumed.</li> <li><strong>What is skipped.</strong> The processes the journal holds are not run again. The
				rest run in the order planned, and the results are assembled exactly as an uninterrupted run
				assembles them.</li> <li><strong>What the file says.</strong> <code>segments</code>, in <!>, counts the stretches the run was measured in: 1 for an
				uninterrupted run. <code>generated_at</code>, and the date in a full run's file name, are
				when the first segment started. <code>duration_ms</code> is the time spent measuring,
				without the time between segments, and <code>load_at_start</code> the highest of the
				segments' load averages at their start.</li> <li><strong>A crash in the middle of a write.</strong> A last line with no newline is a write
				that didn't finish. It is dropped, and that process is measured again. A complete line that
				isn't a journal line is not a crash, and the journal is refused.</li></ul> <p>The journal is removed once the results file is written. A smoke run is short and keeps none.</p>`,1),A=r(`<!> <p>A library whose rounds on a cell are far apart was disturbed by something: another program, or
			its own processes disagreeing. Once a cell's passes are done, a timed run measures each
			library whose <code>spread</code> there is over 1.25 again, every pass of it, up to <code>--retries</code> more times (2 by default) and until an attempt is under the threshold.</p> <p>The attempt kept is the one with the lowest spread, the earliest if they tie. It is never
			chosen by its time. Keeping the fastest attempt would pull every retried number toward fast,
			and would favor a noisier library, which is retried more often. Choosing on agreement alone
			takes the measurement that was least disturbed, whichever way it moved the number.</p> <p><code>attempts</code> records how many times a library was measured on a cell, so the numbers
			that needed a retry can be told from the rest. A retried value's spread and percentiles are
			those of the attempt that was kept, so they describe its calmest attempt, not everything that
			was measured. The summary a run prints counts the retried cells of each library, and lists the
			library-cells still over the threshold after the last attempt. What should be the same every
			time (the token count, the output size, and whether the library passed the check) must agree
			across attempts as it must across passes, or the run fails at that cell.</p> <p>A smoke run doesn't retry, and cold-start scenarios are never retried.</p>`,1),j=r(`<p>The run this site shows was measured on <strong> </strong> </p>`),M=r(`<p><!></p>`),N=r(`<!> <p>Before a machine's numbers are trusted, it is calibrated. A calibration measures every library
			as if it were two libraries: each gets twice the passes, split alternately into two arms, and
			each arm is exactly what a full run would measure. The two arms should be equal. How far apart
			they are is what the machine and the method produce when nothing differs, including what
			varies from one process to the next. <!> holds three
			numbers:</p> <ul><li><code>per_cell</code> is the 95th percentile of that difference, across cells and libraries.
				A difference between two libraries in one cell that is smaller than this is not a result.</li> <li><code>geomean</code> takes each library's two geometric means over all cells, and is their
				difference for the library where it was largest.</li> <li><code>per_process</code> is the 95th percentile of the difference between two passes of one
				arm, over every pair of passes, arm, cell, and library: how far two single processes
				measuring the same thing come apart. It reads higher than <code>per_cell</code>, which
				compares values that each pool several processes.</li></ul> <p>A difference is the larger time over the smaller, less one, so it reads the same whichever arm
			was slower.</p> <p>A calibration is written to <code>results/calibration_&lt;machine&gt;.json</code>. A later
			full run copies its noise floor if the calibration describes that run: unfiltered, with a
			stable anchor, and on the same machine name, CPU, threads, and frequency settings, with the
			same Node version, corpus, and parameters, retries included, and every library at the same
			version with the same extra packages. The commit is not compared, so a commit that changes
			nothing measured keeps the floor. Otherwise the run records no noise floor and says why, and
			the site won't publish it.</p> <p>A calibration retries too, each arm of a library on its own and by the same rule, so an arm
			stays exactly what a full run would measure and the floor describes a full run with the same
			retries. The rule looks only at an arm's own rounds, never at how far apart the two arms are,
			so it can't steer the floor. A calibration file's values are the first arm's, and so are their <code>attempts</code>.</p> <p>Every run with more than one pass also measures its own process noise, an A/A figure taken
			from the run itself: each library on each cell was measured by several processes that should
			agree, and every pair of a value's <code>pass_medians_ns</code> gives a difference. <!> records how many pairs there were and their
			median, 95th percentile, and largest difference, as <code>meta.process_noise</code>. Pairs are
			only ever taken within one library on one cell. Its 95th percentile is the run's counterpart
			of the calibration's <code>per_process</code>, and the run's summary and the provenance line
			on the results page print the two side by side. Both are the 95th percentile of one sample, so
			either is higher about as often as not: a run's figure several times the calibration's is what
			says its processes disagreed more than the calibration's did. The reader compares them, and
			the site does not refuse a run over it.</p> <!>`,1),P=r(`<!> <p>A run measures a fixed reference workload before its first process and after its last. The
			workload involves no measured library, so a change between the two readings is the machine
			changing state: heat, frequency scaling, another program. <code>drift</code> is the relative
			change, in <!>, and a run is <code>stable</code> while it
			stays under 3%.</p> <p>The anchor only brackets the run. Something that disturbed the middle of it shows as a high <code>spread</code>, and the summary a run prints lists every library whose rounds on a cell
			disagreed.</p> <p>A run that was stopped and resumed takes a reading at the start and end of every segment, and
			its drift is that of the two readings furthest apart. A machine that changed state between
			segments, or within one, is then flagged and not hidden by readings that happen to agree at
			the two ends. A segment stopped by a signal or a failed process still takes its closing
			reading. One that was killed outright can't, and the next segment's opening reading stands in
			for it.</p> <p>Before it spawns anything, a run reads the machine's load average over the last minute and
			records it as <code>load_at_start</code>. On a quiet machine it is well under 1, and a timed
			run warns when it is over 1, since something else is then running. It warns and goes on: the
			anchor, the spread, and the retries are what judge the run.</p>`,1),F=r(`<!> <p>Two measurement runs at once make each other wrong, not just noisy. A run takes a machine-wide
			lock, the file <code>/tmp/fuz_benchmark.lock</code> that names its process, and holds it for
			as long as it measures, as does each segment of a resumed run. The path is fixed and ignores <code>TMPDIR</code>, and the lock is fuz_util's benchmark lock, so any other benchmark that
			uses it takes the same one and never measures at the same time as this one. A second run is
			refused and told who holds the lock. A lock whose process is gone is taken over.</p>`,1),I=r(`<!> <ul><li><strong>Features vary.</strong> The libraries have different features. Shiki highlights with
				the TextMate grammars and themes VS Code uses; Twinkleplop aims for a similar feature set,
				with its own themes, annotations, and Twoslash support; and both do more than fuz_code,
				which has the fewest features of the four: a single-pass lexer per language, with CSS
				classes for its theme. Their fidelity differs too: how finely each splits the same source,
				and how accurately it classifies each part. These numbers compare the work all of them
				share, not what one offers that another doesn't, and they time each library's output without
				scoring its quality.</li> <li><strong>The languages are fuz_code's.</strong> The languages measured are fuz_code's
				built-in set, so the list favors it. Prism and Shiki each support hundreds of languages, and
				none of that shows here.</li> <li><strong>Classes and inline styles.</strong> Shiki resolves colors while it tokenizes and
				writes them inline, and the other libraries emit class names that a stylesheet colors. The <code>html</code> mode measures the HTML each library returns by default, which is not the
				same work.</li> <li><strong>Token counts differ.</strong> A library that emits fewer tokens for the same source
				may be doing less work for each byte, not the same work faster.</li> <li><strong>fuz_code's tokens are not kept.</strong> fuz_code lexes into one buffer that every
				call reuses, so its <code>tokenize</code> call allocates no result, where most other
				libraries return one the caller keeps. A consumer that keeps a result copies it, and the
				timed call doesn't, as <!> describes. The <code>html</code> mode
				has no such difference: every library returns a string.</li> <li><strong>Synchronous paths.</strong> A library with an async API loads in its setup and is
				timed through its synchronous core.</li> <li><strong>The HTML is read.</strong> In <code>html</code> mode the timed call reads one
				character of the string, so a library that returns a string the engine hasn't joined up pays
				to flatten it inside the clock. A benchmark that discards the string doesn't charge for
				that, so these numbers can differ from a library's own.</li> <li><strong>Markdown without its fences.</strong> A timed process loads only the language it
				measures, so a fenced code block inside Markdown is not highlighted, with the exceptions <!> lists. A site that loads several languages pays more for
				Markdown than these cells show.</li> <li><strong>Home turf.</strong> Some inputs are a measured library's own samples, which it was
				developed against. They are labeled with that library wherever they appear, summarized by
				owner, and left out of the default view and the headline figures, which use the neutral
				inputs.</li> <li><strong>Stress inputs.</strong> Some inputs are built to find each library's worst case:
				minified code, deep nesting, very long lines, constructs that never close. They say little
				about typical code, so they are summarized on their own and left out of the default view and
				the headline figures. A slow call there can be far slower than anywhere else, and a run
				shows it as measured. Shiki is timed highlighting every line in full: where one line takes
				longer than its default per-line time limit (500ms), a consumer gets the rest of that line
				as one plain token instead, and not the time shown, as <!> describes.</li> <li><strong>One bundler's sizes.</strong> A bundle size is what a page ships when Vite, with the
				Rolldown inside it, builds it and esbuild minifies it; the results file records the three
				versions. Another bundler can remove different code from the same entry, since what it can
				prove unused, whether it folds a constant argument into a function, and how it wraps
				CommonJS all vary. Built by Rollup, which Vite used before Rolldown, with the same options,
				the bundles differ unevenly: Rollup removes Twinkleplop's diagnostics code, which it proves
				is never called, and Rolldown keeps it; Rollup specializes a function fuz_code's Markdown
				language calls with a constant argument, and Rolldown doesn't; and Rolldown adds a small
				CommonJS interop helper to Prism's bundles.</li> <li><strong>Synthetic inputs.</strong> A few inputs were built by joining or repeating files to
				reach a size, or derived from one by minifying it, and are marked. A repeated file is more
				regular than real code of the same size.</li> <li><strong>Steady state.</strong> In a cell, every library is warm when it is timed. What a
				first call costs is in the cold-start scenarios.</li> <li><strong>Cold start is Node's.</strong> A cold-start time is a Node process on one machine,
				with the files already in the page cache. A browser parses and compiles differently, and
				fetches over a network, where the bundle sizes matter instead.</li> <li><strong>Unbundled depends on the install.</strong> The unbundled form loads the files a
				package manager laid out, so its time moves with the number of files a library ships and how
				deep they sit. It says what that library costs a Node process without a bundler, and nothing
				about a page.</li> <li><strong>Collections.</strong> Every batch follows a rewarm (unless one call outlasts it) and
				a forced minor collection, and full collections happen only when the engine schedules them,
				so garbage from earlier batches carries into later ones and a full collection can still land
				inside a batch. A library pays for what it allocates (in the JS heap or outside it) as the
				engine collects it during the run, which is close to, but not the same as, how a page
				collects between highlights.</li> <li><strong>Measured alone.</strong> A page that loads several highlighters, or a busy
				application, gives the engine a different history than a process holding one library.</li></ul>`,1),L=r(`<!> <p>Twinkleplop's own <a href="https://github.com/pngwn/twinkleplop">comparison harness</a> is the
			one this method builds on, and the two answer different questions: it tracks Twinkleplop
			against other libraries across its own versions, and this one compares a fixed roster on
			shared inputs. Where they differ, as of Twinkleplop 0.3.1:</p> <table><thead><tr><th></th><th>Twinkleplop's</th><th>this benchmark</th></tr></thead><tbody><tr><td>libraries</td><td>Twinkleplop, Shiki (both engines), Prism, sugar-high, speed-highlight</td><td>fuz_code, Twinkleplop, Prism, Shiki (both engines)</td></tr><tr><td>languages</td><td>a broad set, most of what Twinkleplop supports</td><td>the timed languages every library here supports</td></tr><tr><td>inputs</td><td>generated inputs at three sizes per language, and Shiki's samples</td><td>pinned files no measured library wrote as the headline, with Shiki's samples, the
						libraries' own, snippets, and stress inputs kept apart</td></tr><tr><td>isolation</td><td>one process per cell, its libraries alternating within each round</td><td>one process per library and pass, in a rotating order</td></tr><tr><td>languages loaded</td><td>every language each adapter maps, in every process</td><td>only the cell's language</td></tr><tr><td>rounds</td><td>one pass of several rounds, a short rewarm, a full collection each round</td><td>several passes of a few rounds each, a longer rewarm, a minor collection only</td></tr><tr><td>statistics</td><td>median, minimum, p10 and p90, spread, and a bootstrap interval</td><td>median, p10 and p90, spread, each pass's median, and the gap between processes</td></tr><tr><td>retries and noise</td><td>no retries; a calibrated noise floor for its A/B harness, not the comparison</td><td>a disturbed cell is measured again; a calibrated noise floor for the comparison itself</td></tr><tr><td>HTML timing</td><td>the returned string is discarded, so a library returning a rope never flattens it</td><td>one character of the string is read inside the clock, which flattens it</td></tr><tr><td>cold start</td><td>Twinkleplop alone, with scenarios about its own internals</td><td>every library, through the same bundle entries, in the results file</td></tr><tr><td>other metrics</td><td>token counts</td><td>bundle size, install footprint, retained heap, token counts, output sizes</td></tr><tr><td>history</td><td>a history of published runs across versions</td><td>each published run stands alone</td></tr><tr><td>machine</td><td>a bare-metal server with boost off, the run confined to cores away from the system's</td><td>a laptop with boost, SMT, and ASLR left at their defaults</td></tr></tbody></table> <p>Numbers from the two are not comparable with each other: the machines, the inputs, and the
			HTML timing differ.</p>`,1),R=r(`<!> <p>A results file records the commit, the Node version, the machine, the corpus hash, and every
			library's version and extra packages. From a checkout of that commit, <code>npm ci</code> installs the same versions, and the command for the kind of run measures it again. The
			deterministic numbers come out the same on any machine running the same Node version, the
			retained heap within its tolerance, and a run stops if one of its processes disagrees with the
			committed <!>. A full run with no filters is refused unless that
			file describes it. Run the smoke run first: it checks every cell and every first highlight
			against the file, before a long run can stop on a disagreement. The timed numbers depend on
			the machine, so compare the ratios between libraries rather than the times.</p> <p>A quiet machine matters more than a fast one: close other programs, and prefer a fixed CPU
			frequency governor. Before trusting a run, check that its anchor is stable, that <code>spread</code> is near 1 for every library in every cell, and that nothing unexpected is
			excluded, from a cell or from a cold-start scenario. <code>bench/run.ts</code> prints all
			three when it finishes, with how many library-cells were retried and whether the run was
			resumed.</p>`,1),ne=r(`<section><p>The timed harness measures throughput: how long each library takes to tokenize an input, and
			to render it as HTML. It then measures cold start: what a library costs a process before it
			has highlighted anything. <code>bench/run.ts</code> runs both and writes one <!>. <!></p> <p>The method builds on the comparison harness of <a href="https://github.com/pngwn/twinkleplop">Twinkleplop</a> (MIT), and the anchor workload
			is ported from it. It differs in giving each library a process of its own, where Twinkleplop
			measures a cell's libraries together in one. The cold-start scenarios generalize Twinkleplop's
			cold-start harness across libraries.</p></section> <!> <!> <!> <!> <!> <!> <!> <!> <!> <!> <!> <!> <!> <!>`,1);function z(r,z){d(z,!0);let B=g(`method`),V=y.get(),H=p(V);b(r,{get tome(){return B},children:(r,c)=>{var d=ne(),p=f(d),g=u(p),y=s(u(g),3);_(y,{slug:`results`});var b=s(y,2),z=e=>{var n=h(`No run has been published, so the site has no timed numbers yet.`);t(e,n)};e(b,e=>{n(H).source===`deterministic`&&e(z)}),m(g),o(2),m(p);var B=s(p,2);x(B,{children:(e,n)=>{var r=T(),i=f(r);S(i,{text:`Cells`});var a=s(i,2),c=s(u(a));_(c,{slug:`corpus`}),o(7),m(a),t(e,r)},$$slots:{default:!0}});var V=s(B,2);x(V,{children:(e,n)=>{var r=ee(),i=f(r);S(i,{text:`One process, one library`}),o(10),t(e,r)},$$slots:{default:!0}});var U=s(V,2);x(U,{children:(e,n)=>{var r=te(),i=f(r);S(i,{text:`Inside a process`});var a=s(i,4),c=u(a),l=s(u(c),2);_(l,{slug:`adapters`}),o(),m(c),o(10),m(a),o(4),t(e,r)},$$slots:{default:!0}});var W=s(U,2);x(W,{children:(e,n)=>{var r=E(),i=f(r);S(i,{text:`What each number means`});var a=s(i,2),c=s(u(a));v(c,{name:`BenchCellValue`}),o(),m(a);var l=s(a,4),d=s(u(l),5);_(d,{slug:`deterministic`}),o(),m(l);var p=s(l,2),h=s(u(p),2);_(h,{slug:`deterministic`}),o(),m(p),t(e,r)},$$slots:{default:!0}});var G=s(W,2);x(G,{children:(e,n)=>{var r=D(),i=f(r);S(i,{text:`Cold start`});var a=s(i,2),c=s(u(a));v(c,{name:`BenchStartup`}),o(),m(a);var l=s(a,8),d=u(l),p=s(u(d),2);_(p,{slug:`deterministic`}),o(),m(d),o(2),m(l);var h=s(l,8),g=s(u(h),8);v(g,{name:`BenchRun`}),o(),m(h);var y=s(h,10),b=s(u(y),4);_(b,{slug:`deterministic`}),o(),m(y),o(4),t(e,r)},$$slots:{default:!0}});var K=s(G,2);x(K,{children:(e,n)=>{var r=O(),i=f(r);S(i,{text:`Kinds of run`});var a=s(i,2),c=s(u(a));v(c,{name:`BenchRun`}),o(),m(a);var l=s(a,4);C(l,{lang:`bash`,dangerous_raw_html:`npm run bench -- --machine <span class="token_operator">&lt;</span>name<span class="token_operator">></span>            <span class="token_comment"># a full run: results/&lt;date>_&lt;name>.json</span>
npm run bench:calibrate -- --machine <span class="token_operator">&lt;</span>name<span class="token_operator">></span>  <span class="token_comment"># the noise floor: results/calibration_&lt;name>.json</span>
npm run bench:smoke                          <span class="token_comment"># everything once, briefly and in parallel</span>
node bench/run.ts --langs ts --sizes small   <span class="token_comment"># part of a run, to results/scratch/</span>
node bench/run.ts --metrics startup          <span class="token_comment"># cold start alone, to results/scratch/</span>
npm run bench -- --machine <span class="token_operator">&lt;</span>name<span class="token_operator">></span> --plan     <span class="token_comment"># what a run would do, measuring nothing</span>
npm run bench -- --machine <span class="token_operator">&lt;</span>name<span class="token_operator">></span> --resume   <span class="token_comment"># continue a run that was stopped</span>
node bench/run.ts --help`}),o(6),t(e,r)},$$slots:{default:!0}});var q=s(K,2);x(q,{children:(e,n)=>{var r=k(),i=f(r);S(i,{text:`Stopping and resuming`});var a=s(i,4),c=s(u(a),12),l=s(u(c),4);v(l,{name:`BenchRun`}),o(7),m(c),o(2),m(a),o(2),t(e,r)},$$slots:{default:!0}});var J=s(q,2);x(J,{children:(e,n)=>{var r=A(),i=f(r);S(i,{text:`Retries`}),o(8),t(e,r)},$$slots:{default:!0}});var Y=s(J,2);x(Y,{children:(r,c)=>{var d=N(),p=f(d);S(p,{text:`The noise floor`});var g=s(p,2),_=s(u(g));v(_,{name:`BenchNoiseFloor`}),o(),m(g);var y=s(g,10),b=s(u(y),3);v(b,{name:`BenchProcessNoise`}),o(5),m(y);var x=s(y,2),C=e=>{var r=j(),o=s(u(r)),c=l(o,!0),d=s(o);m(r),a((e,t)=>{i(c,n(H).machine),i(d,`, whose floor is
				${e??``} for one cell and
				${t??``} for a geometric mean. The results page marks a
				ratio inside it.`)},[()=>w(n(H).noise_floor.per_cell),()=>w(n(H).noise_floor.geomean)]),t(e,r)},T=r=>{var i=M(),a=u(i),o=e=>{var n=h(`No timed run is published yet, so there is no floor to show here.`);t(e,n)},s=e=>{var n=h(`The run this site shows carries no floor, so its small differences can't be told from
					noise.`);t(e,n)};e(a,e=>{n(H).source===`deterministic`?e(o):e(s,-1)}),m(i),t(r,i)};e(x,e=>{n(H).noise_floor&&n(H).machine?e(C):e(T,-1)}),t(r,d)},$$slots:{default:!0}});var X=s(Y,2);x(X,{children:(e,n)=>{var r=P(),i=f(r);S(i,{text:`The anchor`});var a=s(i,2),c=s(u(a),3);v(c,{name:`BenchAnchor`}),o(3),m(a),o(6),t(e,r)},$$slots:{default:!0}});var Z=s(X,2);x(Z,{children:(e,n)=>{var r=F(),i=f(r);S(i,{text:`One run at a time`}),o(2),t(e,r)},$$slots:{default:!0}});var Q=s(Z,2);x(Q,{children:(e,n)=>{var r=I(),i=f(r);S(i,{text:`Caveats`});var a=s(i,2),c=s(u(a),8),l=s(u(c),4);_(l,{slug:`adapters`}),o(3),m(c);var d=s(c,6),p=s(u(d),2);_(p,{slug:`adapters`}),o(),m(d);var h=s(d,4),g=s(u(h),2);_(g,{slug:`adapters`}),o(),m(h),o(14),m(a),t(e,r)},$$slots:{default:!0}});var $=s(Q,2);x($,{children:(e,n)=>{var r=L(),i=f(r);S(i,{text:`Compared with Twinkleplop's benchmark`}),o(6),t(e,r)},$$slots:{default:!0}});var re=s($,2);x(re,{children:(e,n)=>{var r=R(),i=f(r);S(i,{text:`Reproducing a run`});var a=s(i,2),c=s(u(a),3);_(c,{slug:`deterministic`}),o(),m(a),o(2),t(e,r)},$$slots:{default:!0}}),t(r,d)},$$slots:{default:!0}}),c()}export{z as t};