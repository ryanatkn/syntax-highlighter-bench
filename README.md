# syntax-highlighter-bench

> neutral benchmark suite and results site for JavaScript syntax highlighters

This project aims to comprehensively benchmark
[twinkleplop](https://twinkleplop.pngwn.at/),
[Prism](https://prismjs.com/),
[Shiki](https://shiki.style/),
[fuz_code](https://github.com/fuzdev/fuz_code) (same author as this project),
and other syntax highlighters.
The [website](https://syntax-highlighter-bench.ryanatkn.com/) has more.

**Status: early.** The adapters, the corpus, the check that guards against a
plain-text fallback, the harness that times the libraries, warm and from a cold
start, and writes a results file, the deterministic measurements (bundle size,
token counts, output sizes, coverage), and the site that renders a results file
exist. The deterministic numbers are committed as `results/deterministic.json`,
and the site shows them. No timed numbers are published, and the site says so
wherever one would be.

## Layout

- `bench/` — the harness. It runs on Node directly, through type stripping,
  and is never imported by the site.
  - `bench/adapter.ts` — the contract every library is driven through
  - `bench/libraries.ts` — the roster, and `bench/libraries/<id>/` — one
    adapter per library, with notes on the entry points it uses
  - `bench/check_output.ts` — the check each library passes before it is measured
  - `bench/run.ts` — the timed harness: a run, written as one results file
  - `bench/cell.ts` — one library on one cell, measured in a process of its own
  - `bench/coldstart.ts` — the cold-start scenarios, and the process that takes
    one sample
  - `bench/journal.ts` — the journal a timed run keeps, so it can be resumed
  - `bench/deterministic.ts` — the deterministic results file, from
    `bench/sizes.ts` (bundle size) and `bench/outputs.ts` (token counts and
    output sizes)
  - `bench/corpus/` — the inputs, with their manifest
  - `bench/langs.ts` — the language ids every adapter maps onto
  - `bench/sets.ts` — the feature sets bundle size is measured over
- `results/` — where the harness writes runs; `deterministic.json` is
  committed, and no timed run is yet. [results/README.md](results/README.md)
  says what each file is and how a run is published
- `src/lib/results_schema.ts` — the schema of a results file, written by the
  harness and parsed by the site
- `src/lib/` — besides the schema, the modules and components that turn a
  results file into the tables of the site
- `src/routes/` — the site, static SvelteKit: the landing page, `/results`, and
  the docs under `/docs`

## What is measured

Two classes of number, kept apart in the results file:

- **Machine-dependent**, to be published only from one named machine:
  throughput for each input and mode (`tokenize` and `html`), with each
  process's peak memory beside it; cold start.
- **Deterministic**, the same anywhere: bundle size for each feature set, with
  wasm and theme CSS reported separately; output size; token counts; the
  coverage matrix.

The timed harness measures throughput, cold start, and memory. The
deterministic numbers have a command of their own, and a timed run carries them
too.

**Language ids.** The harness owns them. The timed ids are the ones every
library in the roster supports: `ts`, `js`, `css`, `html`, `json`, `svelte`,
`md`, `bash`, `rust`. `xml` is also an id but untimed, because twinkleplop has
no XML language; it is named by the coverage matrix and the feature sets, and
never by a cold-start scenario that loads one language. A language a library doesn't claim is
_unsupported_; a claimed one whose output fails the pre-measurement check is
_excluded_. The two are recorded differently and neither is ever a zero.

**Feature sets.** A named list of language ids, declared before any numbers
exist so a set can't be chosen to flatter a result: `core` (no languages),
`single:<lang>` for each id, `docs` (what a documentation site imports),
`web_rust` (footnoted as fuz_code's full set), and `all`.

## The site

A static site, prerendered from one results file.

- **`/`** — what the benchmark is, each library's headline figures (geometric
  mean throughput over the neutral inputs, time to a first highlight from a
  cold start, bundle size over the `docs` set as JavaScript alone and as
  everything a page loads, with the wasm binary and the theme stylesheet beside
  them), the coverage matrix, where the numbers came
  from, and the libraries table.
- **`/results`** — every number as a table with a column for each library:
  throughput, cold start, bundle size, and token counts and output sizes. A
  number has its ratio to the best in its row, or to a reference library the
  reader picks. Filters choose the libraries (also by engine kind and output
  shape), languages, input sizes, modes, and input sources, and the selection
  is kept in the URL query, so a comparison is a link. A geometric mean covers
  only the rows where every selected library has a number, and says how many.
  Bundle size opens on what each language adds to a library
  (`single:<lang>` less `core`), with the sum over a set beside the set's
  measured size. The sum is not a bundle, so no library is ranked by it. The
  set totals have a row for the JavaScript and a row for everything a page
  loads: the JavaScript, the wasm binary, and the theme stylesheet, each
  compressed on its own.
  Cold start is shown as what a library adds over bare Node. An addition
  smaller than the spread of bare Node itself is marked as in the noise and
  has no ratio. The others in its row are then compared with that spread and
  shown as at least so many times it (`≥6.1×`), and the row is left out of the
  mean.
- **`/docs`** — the method, the adapters, the corpus with its table of inputs,
  the languages and sets, the deterministic metrics, and the results file.

**Which file.** The pages render `results/latest.json`, the latest published
timed run, when it is committed, and otherwise `results/deterministic.json`.
The file is parsed through the schema when the site is built, in the server
loads of the prerendered pages (`src/lib/server/site_results_load.ts`), so a
malformed file fails the build and neither the file's schema nor the harness
reaches the browser. With no published run, the timed sections say that no
timed results are published, and show no number.

**What may be published.** `results/latest.json` must pass
`bench_results_is_publishable`, or the build fails and says why: a smoke run, a
calibration, a filtered run, a run with a gap, a run from a commit with
uncommitted changes, a run whose anchor drifted, and a run with no noise floor
are never shown as results.
A drifted run is measured again, not published under a warning. A
`results/deterministic.json` that holds a timed number fails the build too.

**A published run beside the deterministic file.** When the two describe the
same library versions and the same corpus, their deterministic numbers (feature
sets, coverage, bundle sizes, and each cell's token counts and output sizes)
must be equal, or the build fails and names the first place they differ. When a
library's version or the corpus has moved since the run, the run is shown as
the snapshot it is, and the line that says where the numbers came from says
what has moved.

**The fixture.** `src/test/fixtures/results/fixture_run.json` is a complete run
with invented numbers, for the tests and for working on the timed views before
a run exists. A build or dev server renders it only when
`BENCH_RESULTS_FIXTURE=1` is set, and then every page carries a banner: "fixture
data — invented numbers, not measurements". Without the variable the file is
never read.

**Unsupported and excluded** look different in every table: an unsupported
entry names the languages the library lacks, and an excluded one carries the
reason its output failed the check. A home input is always shown under the
library whose samples it is, and two libraries' home inputs are never
summarized together.

## Adapters

Each library is measured through one adapter: `bench/libraries/<id>/adapter.ts`,
with a `notes.md` beside it saying which entry points it calls and why. An
adapter maps the language ids onto the library's own, exposes the library's
tokens-out and HTML-out calls, counts its tokens, and writes the module a bundle
is measured from and a cold start imports. The rules:

- **Same stage.** The narrowest public entry doing the same work as the other
  libraries'.
- **Explicit languages.** A library is measured only on the languages its
  adapter lists, and a call for any other throws. A library that returned
  escaped plain text for a language it didn't know would benchmark as very fast.
- **Token counts recorded, not equalised.** Libraries split the same source
  differently, so each count is the library's own and the notes define it.
- **Synchronous timed paths.** A library with an async API loads in `setup` and
  is timed through its synchronous core.
- **Browser-safe.** No Node-only API, so the same adapter can run in a page.

Before a library is measured on a language, `check_output` runs it on a short,
syntax-dense snippet of the language: it must produce tokens, and HTML with
several kinds of styled span. Each input then has to clear a lower floor. A
failure is recorded as excluded, with the reason, rather than measured.

One caveat follows from the rules: a timed process loads only the language it
measures, so every library has the same languages loaded. Markdown is therefore
measured without highlighting inside fenced code blocks, which some libraries
would otherwise do and others never do. Two exceptions come from what loads with
Markdown itself: Prism's Markdown depends on its markup grammar, so Prism still
highlights a fence tagged `html`, `xml`, `svg`, or `markup`, and fuz_code and
Prism highlight a fence tagged as Markdown.

### Adding a library

1. Add the library as a devDependency.
2. Write `bench/libraries/<id>/adapter.ts`, exporting a `HighlighterAdapter`
   (see `bench/adapter.ts`), and `notes.md` beside it.
3. Add the adapter to `ADAPTERS` in `bench/libraries.ts`.

The tests then run it on every language it claims and every corpus input. The
results file carries the roster of libraries, so the site needs no change.

## Corpus

Every input is a file under `bench/corpus/`, labelled by where it came from:

- `neutral` — real files from projects no measured library authored, pinned to
  an upstream commit: the primary set
- `shiki` — the samples Shiki's own benchmark uses
- `home` — a measured library's own samples, labelled as its home turf
- `harness` — one short snippet per language, written for this benchmark

Inputs fall into size tiers by their real size (`micro`, then `small`,
`medium`, and `large` at roughly 1KB, 10KB, and 100KB). An input built by joining
or repeating files is marked `synthetic`. The manifest records each input's hash
and its upstream repository, commit, path, and license, and a run records a hash
over the whole corpus.

[bench/corpus/README.md](bench/corpus/README.md) has the details, and
[bench/corpus/INPUTS.md](bench/corpus/INPUTS.md) lists every input.

```bash
npm run corpus:check     # the manifest matches the files, and every copy its pin
npm run corpus:manifest  # regenerate the manifest after adding an input
```

## The timed harness

`bench/run.ts` measures every library on every input of the corpus in each
mode, then in every cold-start scenario, and writes one results file through
the schema.

```bash
npm run bench -- --machine <name>            # a full run: results/<date>_<name>.json
npm run bench:calibrate -- --machine <name>  # the noise floor: results/calibration_<name>.json
npm run bench:smoke                          # everything once, briefly and in parallel
node bench/run.ts --langs ts --sizes small --metrics throughput  # part of a run, to results/scratch/
node bench/run.ts --metrics startup          # cold start alone, to results/scratch/
npm run bench -- --machine <name> --plan     # what a run would do, measuring nothing
npm run bench -- --machine <name> --resume   # continue a run that was stopped
node bench/run.ts --help
npm run results:publish -- results/<date>_<name>.json  # make a publishable run results/latest.json
```

A **cell** is one input in one mode, across the libraries that claim its
language. The method, and why each part is there:

- **A process for each library.** A process measures one library on one cell
  and loads no other, so no library can move another's number. Two effects made
  that necessary. Libraries that share code, as Shiki's two engines do, change
  how the JavaScript engine optimises that code for each other. And the engine
  sizes its young generation from what has been allocating, so a library's time
  depended on which libraries ran beside it.
- **Several passes, with a rotating start.** A cell is measured in passes, each
  a process for every library, one after another. The same code can settle at a
  slightly different speed from one process to the next, so a library's number
  pools the rounds of all its passes. The library a pass starts with changes
  from pass to pass and cell to cell.
- **One language loaded.** The process sets up exactly the cell's language,
  once, before anything is timed.
- **The output is checked first**, on the language's snippet and then on the
  input. A library that fails is recorded as excluded and is not timed.
- **Iterations calibrated for each library**, since speeds differ by orders of
  magnitude. A batch makes at least a few calls while they fit a cap, and a call
  too long for that is measured once per batch.
- **A full collection, a rewarm, and a minor collection before every timed
  batch.** A batch inherits no garbage from the one before it, the library runs
  untimed to recover from the collection, and what the rewarm allocated is
  cleared so that collection doesn't land in the batch.
- **Results are kept and counted.** The last result of each batch is counted
  after the clock stops, and a count that differs from the checked one fails
  the cell: a tokenizer that silently stops early must not look fast.
- **The HTML is read.** Some libraries return a string the engine hasn't joined
  up yet, which is cheap to build and which every consumer pays to flatten on
  first use. The timed call reads one character of the string, for every
  library, so that cost is inside the clock. The cost depends on the size of
  the output, not on the library, so it weighs most on the fastest one.

A full run measures each library in 3 processes per cell, each timing 4 rounds
of 20ms batches, after a 100ms warmup, with a 300ms rewarm before each batch.
One process runs at a time, and the parent does nothing while it measures.

The rewarm is longer than the warmup on purpose. A forced collection leaves
code cold, and libraries recover from it at different speeds, Shiki more slowly
than the others. A library still recovering when its batch is timed reads slow,
so the rewarm is long enough that every library in the roster has recovered.

### What the numbers mean

| number | meaning |
| --- | --- |
| `ns_per_op` | nanoseconds per call: the median across the rounds of every pass |
| `ops_per_sec`, `mb_per_sec` | the same as calls, and megabytes of input, per second |
| `p10_ns`, `p90_ns` | the 10th and 90th percentile across those rounds |
| `spread` | the slowest round over the fastest, across passes too; near 1 means they agreed |
| `iterations` | calls per batch, as calibrated: the median across passes |
| `rss_peak_bytes` | the peak resident size of the library's process, the largest across passes |
| `attempts` | how many times the library was measured on the cell: 1 unless it was retried |

`rss_peak_bytes` is a whole process: Node itself, the library as its adapter
imports it, with one language set up, and the input. It is not what the library
adds. Compare it between libraries on the same cell. On a small input it says
little about footprint: a process warms up and is timed for a fixed duration,
so its peak follows how much the library allocated in that time more than what
it holds. The cold-start scenarios are where memory is compared.

### Cold start

A timed cell measures a library that is loaded and warm. Cold start measures
the other end: a fresh Node process that loads the library and does one thing,
once. Each sample is one process. The scenarios:

| scenario | what the process does |
| --- | --- |
| `bare` | nothing: the Node baseline, with no library, which every other time includes |
| `core` | imports the library with no language |
| `lang` | imports the library with one language, for each timed language it claims |
| `set` | imports the library with the languages of the `docs` feature set |
| `first_highlight` | imports the library with one language and highlights that language's harness snippet once, to HTML |

- **What is imported** is the module the adapter's `bundle_entry` writes for a
  feature set (`core`, `single:<lang>`, `docs`): the same module bundle size is
  measured over, so a time and a size describe one thing. The adapter modules
  are never loaded: some of them import every language, which would charge a
  library for languages the scenario doesn't load. A first highlight makes the
  call the adapter gives for that module (`bundle_html_source`).
- **Two forms** of every scenario but `bare`. `bundled` imports the built chunk
  whose size is reported, as one file (a library's wasm import stays outside
  it, as it does for the size). Unbundled imports the same module's source from
  a file under `node_modules/.cache/` in the checkout, so Node resolves each
  package from the checkout's `node_modules` and loads every file the library
  reaches, as a consumer without a bundler does.
- **Start is the start of the process, by its own clock.** The process reads
  `performance.now()` once, when its work is done, and Node counts that from
  the moment the process began. A time therefore includes Node starting up, and
  leaves out the parent creating the process, the OS loading the Node binary,
  and the exit, which a clock in the parent would add with their own variance.
  `bare` is the same process with nothing imported, so a scenario's time less
  `bare`'s is what the library added.
- **The process is a consumer's.** It runs a generated module holding the
  import, the one call of a first highlight, and a few lines that report: no
  harness code, and no flags. The source to highlight is a literal in that
  module, and one character of the HTML is read before the clock stops, as the
  timed cells do.
- **The compile cache is off.** V8 can keep compiled code on disk between
  processes, which Node uses only when asked. Every cold-start process runs
  with `NODE_DISABLE_COMPILE_CACHE=1` and without `NODE_COMPILE_CACHE`, each
  sample reports that no cache directory is in use, and the results file
  records it (`meta.run.startup_compile_cache`).
- **Interleaved rounds.** A round runs every scenario once, one process at a
  time, with the parent blocked on each. The scenarios that differ only in the
  library run one after another, and the library that goes first rotates from
  round to round and scenario to scenario. A machine that slows down partway
  slows a sample of every scenario, not the scenarios that came last.
- **The first rounds are discarded.** They bring every file a scenario reads
  into the OS page cache, which a machine pays once and not at every start. A
  full run keeps 20 samples of each scenario, after 3 discarded rounds.
- **Each scenario is checked by its first process.** The import has to work and
  export something, and a first highlight's HTML has to pass the check a timed
  cell applies on the harness snippet. A library that fails is recorded as
  excluded from the scenario, with the reason, and has no number there. A
  process that was ended, by a signal or an abort, did not fail on its own:
  that fails the run, which can be resumed, and excludes nothing. A scenario
  over languages a library doesn't claim is unsupported and never run.
  Every later sample must agree with the first, and a first highlight's HTML
  must be the size the deterministic file has for the library on that snippet.

Each scenario's entry holds `samples`, `median_ms` (milliseconds since the
process started), `p10_ms` and `p90_ms`, `spread` (the slowest sample over the
fastest, wider than a cell's because a process start has a long slow tail), and
`rss_peak_bytes`: the median peak resident size of the processes, read when the
clock stopped. That is a whole process, most of it Node, so subtract the `bare`
entry's.

Nothing is retried: a disturbance lands on one sample of every scenario, not on
one scenario, and the median sets a slow process aside. There is no noise floor
for cold start either, since a calibration measures the timed cells only. Treat
a difference inside either scenario's `p10_ms` to `p90_ms` band as no
difference.

The cold-start processes follow the cells in the same run: under the same
machine lock, between the same anchor readings, in the same journal, and
written to the same results file.

### Kinds of run

- `full` — the real measurement. Only a full run with no filters is publishable,
  and it needs `--machine`. Such a file must also be whole: every library has a
  number or an exclusion in every cell whose language it claims, every input
  it lists has a cell in each mode the file measures, and every library has an
  entry or an exclusion in every cold-start scenario it supports, in both
  forms. A file with a gap doesn't parse.
- `--smoke` — every library on every cell, in one process each, for one round
  of the shortest batches, then one sample of every cold-start scenario,
  several processes at a time. It proves the harness and every adapter work,
  and its numbers mean nothing.
- `--calibrate` — measures the machine's noise floor, on the cells only.

`--libraries`, `--langs`, `--sizes`, `--modes`, and `--sources` restrict a run
to comma-separated ids, and an unknown id is an error. `--libraries` and
`--langs` narrow the cold-start scenarios too; the other three select inputs,
which cold start has none of. `--metrics` measures only `throughput` (the timed
cells) or only `startup` (cold start); naming both is the default, and no
filter, as is `throughput` on a calibration, which measures nothing else. `--passes`, `--rounds`, and
`--target-ms` change how long a cell is measured, `--retries` how often a
disturbed library is measured again, and `--startup-samples` how many processes
sample each cold-start scenario. `--out` chooses the file. A full run is
named by the UTC date it started and its machine, and won't overwrite one
already there. A smoke or filtered run is written to `results/scratch/`, which
git ignores. The results file records the kind of run, its parameters, and its
filters. No results file is written if a process fails.

`--plan` prints what a run would do and measures nothing: the cells, libraries,
and processes, the cold-start scenarios with the processes they add, the
parameters, the machine's state and load average, where the results and the
journal would go, and
an estimate of how long it would take, worked out from the parameters. It makes
the same checks a run makes before it measures, so it is refused where the run
would be. A timed run records the 1-minute load average as it starts
(`meta.run.load_at_start`) and warns, without refusing, when it is over 1.

### Stopping and resuming

A full run is one process for each library, pass, and cell, then one for each
sample of each cold-start scenario, one at a time, so it is long, and a
calibration's cells take twice as long. A timed run therefore keeps a
**journal** beside its results file: every process's result is appended and
synced to disk before the next process starts. When a run stops, whether by a
signal, a failed process, or a crash, the journal stays and the run says how to
continue:

```bash
npm run bench -- --machine <name> --resume
```

- **What must match.** The journal's first line records the kind of run, its
  parameters and filters, the corpus hash, every library's version, the
  machine's name, CPU, threads, and frequency settings (governor, driver,
  energy-performance preference, and boost), the OS release, the Node version,
  the `NODE_OPTIONS` the processes inherit, and the commit, with its dirty
  marker.
  `--resume` continues only when all of them are the same for the new command,
  and otherwise is refused, naming what differs. Results from two different
  setups are never mixed. One thing the journal can't see: with a dirty working
  tree it can't tell whether the uncommitted changes are the ones it started
  with, and a resume says so.
- **Nothing installed mid-run.** Every cell process reports the versions of
  its library's packages it found installed, and one that differs from what the
  run was planned with stops the run, naming the package and both versions. A
  package changed between two processes could move a time and nothing else.
  Cold-start processes report none, so the run reads the versions again before
  writing its file, and on a change writes nothing and sets the journal aside
  as `<journal>.changed`: its cold-start samples were never checked against the
  change, so the run starts over.
- **Never by accident.** A journal already there stops a run that wasn't given
  `--resume`: it is neither overwritten nor continued until you say which, and
  the refusal says what run the journal records. `--resume` with no journal is
  refused too, as is a journal holding a result the run would never ask for.
- **Never after an overlap.** A run that lost the machine lock sets its journal
  aside as `<journal>.overlapped`, since another run may have overlapped it. It
  writes no results, and the journal can't be resumed.
- **What is skipped.** The processes the journal holds are not run again, the
  rest run in the order planned, and the results are assembled exactly as an
  uninterrupted run assembles them.
- **What the file says.** `meta.run.segments` counts the stretches the run was
  measured in: 1 for an uninterrupted run. `generated_at`, and the date in a
  full run's file name, are when the first segment started. `duration_ms` is
  the time spent measuring, without the time between segments.
- **A crash mid-write.** A last line with no newline is a write that didn't
  finish. It is dropped and that process is measured again. A complete line
  that isn't a journal line is not a crash, and the journal is refused.

The journal is `<out>.journal.jsonl` with `--out`, and otherwise
`<kind>_<machine>.journal.jsonl` in the directory the results go to. It is
removed once the results file is written. A smoke run is short and keeps none.

### Retries

A library whose rounds on a cell are far apart was disturbed by something:
another program, or its own processes disagreeing. Once a cell's passes are
done, a timed run measures each library whose `spread` there is over 1.25
again, every pass of it, up to `--retries` more times (2 by default; 0 turns it
off) and until an attempt is under the threshold.

The attempt kept is the one with the **lowest spread**, the earliest if they
tie. It is never chosen by its time. Keeping the fastest attempt would pull
every retried number toward fast, and would favour a noisier library, which is
retried more often. Choosing on agreement alone takes the measurement that was
least disturbed, whichever way it moved the number.

`attempts` records how many times a library was measured on a cell, so the
numbers that needed a retry can be told from the rest. A retried value's spread
and percentiles are those of the attempt that was kept, so they describe its
calmest attempt, not everything that was measured, and `attempts` is what marks
it. The summary counts the retried cells of each library, and lists the
library-cells still over the threshold after the last attempt. What should
be the same every time (the token count, the output size, and whether the
library passed the check) must agree across attempts as it must across passes.

In a calibration each arm of a library is retried on its own, by the same rule,
so an arm stays exactly what a full run would measure, and the noise floor
describes a full run with the same retries. The rule looks only at an arm's own
rounds, never at how far the two arms are apart, so it can't steer the floor.
A calibration file's values are the first arm's, and so are their `attempts`.
A smoke run doesn't retry, and cold-start scenarios are never retried.

### The noise floor, the anchor, and the lock

**The noise floor.** A calibration measures every library as if it were two:
each gets twice the passes, split alternately into two arms, each arm what a
full run would measure. The two should be equal, and how far apart they are is
the noise, including what varies from one process to the next. The 95th
percentile across cells and libraries is the floor for one cell, and the largest
gap between a library's two geometric means is the floor for a geometric mean.
A later full run carries the floor in its results file if the calibration
describes it: unfiltered, steady, and on the same machine in the same state
(threads and frequency settings), with the same Node version, corpus,
parameters, retries included, and library versions. A difference smaller than
the floor is not a result.

**The anchor.** A run measures a fixed workload, involving no measured library,
before its first process and after its last. A drift past 3% means the machine
changed state during the run, and the absolute times are then suspect. The
anchor only brackets the run, so the summary also lists every library whose
rounds on a cell disagreed. A run that was stopped and resumed takes a reading
at the start and end of every segment, and its drift is that of the two
readings furthest apart, so a machine that changed between segments is flagged
and not hidden. A segment stopped by a signal or a failure still takes its
closing reading; one killed outright can't, and the next segment's opening
reading stands in.

**The lock.** One measurement run at a time, machine-wide: a run holds a lock
file in the OS temp directory for as long as it measures, and a second
run is refused and told who holds it. Each segment of a resumed run holds it
for as long as it measures.

### Caveats

- Shiki resolves colors while tokenizing and writes them inline; the others emit
  classes. The `html` mode measures what each library ships, which is not the
  same work.
- Token counts differ between libraries, and fewer tokens is less work, not
  faster work.
- In a cell, every library is warm when timed. What a first call costs is in
  the cold-start scenarios.
- A cold-start time is a Node process on one machine, with the files already in
  the page cache. A browser parses and compiles differently, and fetches over a
  network, where the bundle sizes matter instead.
- The unbundled form loads the files a package manager laid out, so its time
  moves with how many files a library ships. It says what the library costs a
  Node process without a bundler, and nothing about a page.
- Every batch follows a forced collection and a rewarm, so a library is timed
  just after it has recovered from one, which is not how every application
  runs it.
- A library is measured alone. A page that loads several highlighters, or a
  busy application, gives the engine a different history.
- In `html` mode the timed call reads one character of the string, so a string
  the engine hasn't joined up is flattened inside the clock. A benchmark that
  discards the string doesn't charge for that.
- A timed process loads only the language it measures, so a fenced code block
  inside Markdown is not highlighted, with the exceptions the adapters section
  lists. A site that loads several languages pays more for Markdown.
- Some inputs are a measured library's own samples. They are labelled with that
  library, summarized by owner, and left out of the default view and the
  headline figures, which use the neutral inputs.
- A few inputs were built by joining or repeating files to reach a size, and
  are marked synthetic.
- Shiki stops tokenizing a line after half a second and returns the rest of it
  as one token, so what a call returns depends on how fast the machine is at
  that moment. Both Shiki adapters raise that limit out of reach rather than
  turning it off, so every call does the same work, and still reads the clock
  as Shiki's default does, and a token count is the same anywhere.

To reproduce a run, check out the commit its file records, `npm ci`, and run
the same command. Close other programs first: before trusting a run, check that
its anchor is stable, that `spread` is near 1 in every cell, and that nothing
unexpected is excluded from a cell or a cold-start scenario. `bench/run.ts` prints all three, with how many
library-cells were retried and whether the run was resumed.

Run `npm run bench:smoke` on the machine first. It checks every cell and every
first highlight against the committed deterministic file (`--plan` prints an estimate),
before a long run can stop on a disagreement.

To publish a run, follow [results/README.md](results/README.md): the files in
`results/`, how the machine is quieted, the commands in order, and the checks a
run passes before it is committed as `results/latest.json`.

## Deterministic metrics

Bundle sizes, token counts, output sizes, and the coverage matrix are the same
on any machine. One command measures them, with nothing timed, and writes
`results/deterministic.json`, which is committed:

```bash
npm run bench:deterministic             # regenerate results/deterministic.json
npm run bench:deterministic -- --check  # regenerate in memory, and fail if the committed file differs
```

### Bundle size

For each library and each feature set, the adapter's `bundle_entry` writes the
module a consumer would: the library with exactly the set's languages
registered, in the shape the library documents. `bench/sizes.ts` builds it and
reports:

- `raw` — the minified JavaScript
- `gzip` — those bytes gzipped at level 9
- `brotli` — those bytes brotli-compressed at quality 11

The build is Vite's, in library mode: one ES module, as a production build for
the browser. Vite's library mode never removes the whitespace of an ES module,
which suits a library and not a page, so the module is then minified once,
whole, by the esbuild inside Vite (no bundle in the roster ends up carrying a
license comment). Compression is Node's zlib and brotli.

A set holding a language the library doesn't claim is not measured for it: the
entry names the missing languages, and is never a zero.

The shape each adapter writes is in its `notes.md`:

| library | with languages | with none: `core` |
| --- | --- | --- |
| fuz_code | a `SyntaxStyler` with the needed `lexer_*` modules added | the styler alone |
| twinkleplop | the two factories of each language's package | the runtime and the grammar compiler every language package is built from |
| Prism | the core file and one component file for each grammar | the core file alone |
| Shiki, both engines | `shiki/core`, one engine, the `github-light` theme, one module for each language | the core, the engine, and the theme |

A library's maintainers may know a leaner documented shape. The entry is one
function of the adapter, and a change to it is a small pull request.

**Two things stay out of the JavaScript figures** and have a section each,
because folding them in would hide a real difference. Both are reported as the
JavaScript is, as `raw`, `gzip`, and `brotli`:

- `wasm` — the WebAssembly binary a library loads, and null without one.
  Shiki's Oniguruma engine documents an import that carries the binary inlined
  in a JavaScript module as text. The build leaves that import out, and the
  binary file itself is measured.
- `css` — each library's documented default stylesheet, minified by the same
  esbuild. Output that carries classes needs a stylesheet to show color. Output
  that carries inline styles needs none, so the section is null for Shiki: its
  theme is in the JavaScript figure, and its colors are in every page of HTML.
  A theme of several stylesheets is measured file by file, each compressed on
  its own, and summed.

Default themes don't cover the same ground, and each library's roster entry
says which color schemes its theme holds (`theme_schemes`): fuz_code's and
twinkleplop's stylesheets hold a light and a dark palette, and Prism's holds
one. Read the stylesheet sizes beside that.

**Each bundle is checked.** A bundle that lost a language to tree shaking, or
was written without one, would be reported as small. So every bundle is
imported in a process of its own, and each language of its set is highlighted
through the bundle's exports on that language's snippet. For a bundle of one
language, the HTML has to equal what the library produces through its adapter
with that language set up, which a language missing something it embeds, like
HTML without its script and style languages, does not. A bundle of several
languages has to clear the floor the output check uses: there a Markdown fence
is highlighted that a process with one language loaded leaves plain, so the two
differ by design. The check doesn't prove a bundle is the smallest that works.

**What a language costs.** One set holds no languages and one holds each
language alone, so the bytes a language adds are `single:<lang>` minus `core`,
with no extra measurement. The results page derives that view from the sets
and never stores it, and shows the sum over a set beside the set's measured
size: the sum is larger when a library shares code between languages, and it
is not a bundle anyone ships.

### Token counts and output sizes

For every input and every library that claims its language, `bench/outputs.ts`
records what one `tokenize` call and one `html` call return: the library's own
token count, and the HTML's size in UTF-8 bytes (`html_bytes`) with how many
elements it has (`spans`). They are taken as a timed cell takes them: a process
sets up exactly one language in one library, the snippet check runs, and each
input is then checked.

Each number is stated once for an input, on the cell whose call returns it: the
token count on the `tokenize` cell and the output size on the `html` cell.

What they don't say:

- Token counts are not comparable as work. Shiki counts runs of whitespace and
  unstyled text, the others count only typed tokens, and a container and what
  it holds may each count.
- Classes and inline styles are different HTML. A class name is short and needs
  a stylesheet; an inline color is repeated on every token and needs none.
  Compare `html_bytes` with the theme CSS column beside it.
- Wrappers differ. twinkleplop and Shiki wrap the output in `<pre>` and a span
  for each line; fuz_code and Prism return bare token spans. `spans` counts
  every element.
- Prism's two calls can disagree on Markdown. Prism highlights the inside of a
  fenced block in hooks that only `highlight` runs, so for a fence whose
  language is loaded the HTML holds elements the token count doesn't include.

### Coverage

The coverage matrix is each adapter's language map, with a footnote where the
support is indirect: fuz_code's JavaScript, Prism's Svelte and XML, Shiki's
XML. The footnotes are written once, in the adapters. Shiki's two engines are
two libraries, each with a note saying which engine it is.

### What the file records, and how it stays current

The deterministic file goes through the same schema as a timed run. It holds no
timed value, so it records no machine, time, Node version, or commit: none of
them shaped its numbers. What they depend on is in it: each library's version,
the corpus hash, and the versions of Vite and of the Rollup and esbuild inside
it. Regenerating it on an unchanged tree changes nothing.

One dependency is not in the file: the gzip and brotli sizes come from the zlib
and brotli inside Node, and a Node with another version of either can compress
to a few bytes more or less. Generate the file on the Node version the check
workflow uses.

A timed run takes its cells' token counts and output sizes from its own
processes, by the same check. When the deterministic file describes the run
(the same library versions, corpus, and sets), the run compares each library's
first result on a cell with the file and stops at a difference, and it copies
its libraries' bundle sizes from the file. Otherwise a smoke or filtered run
says why and carries no bundle sizes, and a full run with no filters is refused
before it measures anything: regenerating the file is quick, and the run is
long.

The check workflow (`.github/workflows/check.yml`) runs `gro check`,
`bench:deterministic -- --check`, and the smoke run on every change. None of it measures
speed.

## Neutrality

The maintainer of this benchmark also maintains fuz_code, so fairness has to be
structural. By design:

- the maintainer's library is flagged in the results file and on the site
- every input is labelled by its source — real code no measured library
  authored, Shiki's own benchmark samples, a library's own samples, or a
  snippet written for this benchmark — and the first is the primary set
- each adapter documents the entry points it uses, so a library's maintainers
  can review or replace it
- the method and the commands to reproduce a run are published with the numbers

## Credit

The measurement method builds on the comparison harness of
[twinkleplop](https://github.com/pngwn/twinkleplop) (MIT). Kept from it: a
fresh process for each cell, iterations calibrated per library, a forced
collection and an untimed rewarm before timing, token counts recorded, machine
drift detected, and a machine lock. Changed here: twinkleplop measures a cell's
libraries together in one process, alternating within each round, and this
harness gives each library a process of its own, rotates the order of the
processes, pools several passes, collects before every batch, and reads the HTML
inside the timed call. The anchor workload is ported from it, and the adapter
rules come from the same harness.

Cold start generalises twinkleplop's cold-start harness across libraries. Kept
from it: a fresh process for each sample, scenarios interleaved round by round,
the first rounds discarded, the compile cache off, the bundled chunk measured against the unbundled
import, a bare Node baseline, time to a first highlight, medians rather than
means, and the machine lock. Changed here: the scenarios run for every library
through the adapters' bundle entries; a time is the process's own clock from
its start, read once, where twinkleplop reports a parent-side wall time and
marks inside the process; the process is a generated module with no harness
code; the library that goes first rotates; every sample is checked; and the
samples are journaled as part of a run. Its scenarios that are about
twinkleplop's own internals (a stubbed compiler, shipping a compiled grammar,
the compile cache turned on) are not here.

Statistics and formatting come from
[fuz_util](https://github.com/fuzdev/fuz_util).

The corpus holds files from other projects, each under its own license:
see [bench/corpus/README.md](bench/corpus/README.md).

## Develop

Requires Node >= 24.14.

```bash
npm i
npm run dev # or `gro dev`
gro check   # typecheck, test, lint, format check
gro build   # build the static site
BENCH_RESULTS_FIXTURE=1 gro build # build it over the fixture run: invented numbers, marked on every page
gro format 'bench/**/*' # format the harness, which `gro format` alone doesn't reach
npm run bench:smoke     # run every library on every cell and cold-start scenario once
npm run bench:deterministic -- --check  # the committed deterministic results still regenerate
```

Built with [SvelteKit](https://github.com/sveltejs/kit),
[Svelte](https://github.com/sveltejs/svelte),
[fuz_ui](https://github.com/fuzdev/fuz_ui),
[fuz_css](https://github.com/fuzdev/fuz_css), and
[Gro](https://github.com/fuzdev/gro).

## License

[MIT](LICENSE)
