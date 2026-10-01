# syntax-highlighter-bench

> neutral benchmark suite and results site for JavaScript syntax highlighters

Compares [fuz_code](https://github.com/fuzdev/fuz_code),
[twinkleplop](https://github.com/pngwn/twinkleplop),
[Prism](https://github.com/PrismJS/prism), and
[Shiki](https://github.com/shikijs/shiki) on the same inputs. Shiki's
JavaScript engine and its Oniguruma wasm engine are counted as two libraries.
A run produces one results file holding many metrics, and the site is a view
over that file where a reader picks the subset to compare.

**Status: early.** The adapters, the corpus, the check that guards against a
plain-text fallback, and the harness that times the libraries and writes a
results file exist. The bundle and cold-start measurements and the results pages
are designed but not built, and no numbers are published.

## Layout

- `bench/` — the harness. It runs on Node directly, through type stripping,
  and is never imported by the site.
  - `bench/adapter.ts` — the contract every library is driven through
  - `bench/libraries.ts` — the roster, and `bench/libraries/<id>/` — one
    adapter per library, with notes on the entry points it uses
  - `bench/check_output.ts` — the check each library passes before it is measured
  - `bench/run.ts` — the timed harness: a run, written as one results file
  - `bench/cell.ts` — one library on one cell, measured in a process of its own
  - `bench/corpus/` — the inputs, with their manifest
  - `bench/langs.ts` — the language ids every adapter maps onto
  - `bench/sets.ts` — the feature sets bundle size is measured over
- `results/` — where the harness writes runs; none is committed yet
- `src/lib/results_schema.ts` — the schema of a results file, written by the
  harness and parsed by the site
- `src/routes/` — the site, static SvelteKit, with the docs under `/docs`

## What is measured

Two classes of number, kept apart in the results file:

- **Machine-dependent**, to be published only from one named machine:
  throughput for each input and mode (`tokenize` and `html`), with each
  process's peak memory beside it; cold start.
- **Deterministic**, the same anywhere: bundle size for each feature set, with
  wasm and theme CSS reported separately; output size; token counts; the
  coverage matrix.

The timed harness measures throughput, memory, output size, and token counts,
and records coverage. Bundle size and cold start are not built.

**Language ids.** The harness owns them. The timed ids are the ones every
library in the roster supports: `ts`, `js`, `css`, `html`, `json`, `svelte`,
`md`, `bash`, `rust`. `xml` is also an id but untimed, because twinkleplop has
no XML language; it is named by the coverage matrix and the feature sets. A language a library doesn't claim is
_unsupported_; a claimed one whose output fails the pre-measurement check is
_excluded_. The two are recorded differently and neither is ever a zero.

**Feature sets.** A named list of language ids, declared before any numbers
exist so a set can't be chosen to flatter a result: `core` (no languages),
`single:<lang>` for each id, `docs` (what a documentation site imports),
`web_rust` (footnoted as fuz_code's full set), and `all`.

## Adapters

Each library is measured through one adapter: `bench/libraries/<id>/adapter.ts`,
with a `notes.md` beside it saying which entry points it calls and why. An
adapter maps the language ids onto the library's own, exposes the library's
tokens-out and HTML-out calls, counts its tokens, and writes the module a bundle
is measured from. The rules:

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

`bench/run.ts` measures every library on every input of the corpus in each mode
and writes one results file through the schema.

```bash
npm run bench -- --machine <name>            # a full run: results/<date>_<name>.json
npm run bench:calibrate -- --machine <name>  # the noise floor: results/calibration_<name>.json
npm run bench:smoke                          # everything once, briefly and in parallel
node bench/run.ts --langs ts --sizes small   # part of a run, to results/scratch/
node bench/run.ts --help
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
of 20ms batches, after a 100ms warmup, with a 100ms rewarm before each batch.
One process runs at a time, and the parent does nothing while it measures.

### What the numbers mean

| number | meaning |
| --- | --- |
| `ns_per_op` | nanoseconds per call: the median across the rounds of every pass |
| `ops_per_sec`, `mb_per_sec` | the same as calls, and megabytes of input, per second |
| `p10_ns`, `p90_ns` | the 10th and 90th percentile across those rounds |
| `spread` | the slowest round over the fastest, across passes too; near 1 means they agreed |
| `iterations` | calls per batch, as calibrated: the median across passes |
| `rss_peak_bytes` | the peak resident size of the library's process, the largest across passes |

`rss_peak_bytes` is a whole process: Node itself, the library as its adapter
imports it, with one language set up, and the input. It is not what the library adds. Compare it between libraries on
the same cell.

### Kinds of run

- `full` — the real measurement. Only a full run with no filters is publishable,
  and it needs `--machine`.
- `--smoke` — every library on every cell, in one process each, for one round
  of the shortest batches, several processes at a time. It proves the harness
  and every adapter work, and its numbers mean nothing.
- `--calibrate` — measures the machine's noise floor.

`--libraries`, `--langs`, `--sizes`, `--modes`, and `--sources` restrict a run
to comma-separated ids, and an unknown id is an error. `--passes`, `--rounds`,
and `--target-ms` change how long it measures. `--out` chooses the file. A full
run is named by its UTC date and machine, and won't overwrite one already
there. A smoke or filtered run is written to `results/scratch/`, which git
ignores. The results file records the kind of run, its parameters, and its
filters, and nothing is written if a process fails.

### The noise floor, the anchor, and the lock

**The noise floor.** A calibration measures every library as if it were two:
each gets twice the passes, split alternately into two arms, each arm what a
full run would measure. The two should be equal, and how far apart they are is
the noise, including what varies from one process to the next. The 95th
percentile across cells and libraries is the floor for one cell, and the largest
gap between a library's two geometric means is the floor for a geometric mean.
A later full run carries the floor in its results file if the calibration
describes it: unfiltered, steady, and on the same machine, governor, Node
version, corpus, and parameters. A difference smaller than the floor is not a
result.

**The anchor.** A run measures a fixed workload, involving no measured library,
before its first process and after its last. A drift past 3% means the machine
changed state during the run, and the absolute times are then suspect. The
anchor only brackets the run, so the summary also lists every library whose
rounds on a cell disagreed.

**The lock.** One measurement run at a time, machine-wide: a run holds a lock
file in the OS temp directory until its results are ready to write, and a second
run is refused and told who holds it.

### Caveats

- Shiki resolves colors while tokenizing and writes them inline; the others emit
  classes. The `html` mode measures what each library ships, which is not the
  same work.
- Token counts differ between libraries, and fewer tokens is less work, not
  faster work.
- Every library is warm when timed. What a first call costs is cold start, which
  is not built.
- Every batch follows a forced collection and a rewarm. Shiki recovers from a
  forced collection more slowly than the other libraries; at 100ms its times
  read a few percent high.
- A library is measured alone. A page that loads several highlighters, or a
  busy application, gives the engine a different history.

To reproduce a run, check out the commit its file records, `npm ci`, and run
the same command. Close other programs first: before trusting a run, check that
its anchor is stable, that `spread` is near 1 everywhere, and that nothing
unexpected is excluded. `bench/run.ts` prints all three.

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
rules come from the same harness. Statistics and formatting come from
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
gro format 'bench/**/*' # format the harness, which `gro format` alone doesn't reach
npm run bench:smoke     # run every library on every cell once
```

Built with [SvelteKit](https://github.com/sveltejs/kit),
[Svelte](https://github.com/sveltejs/svelte),
[fuz_ui](https://github.com/fuzdev/fuz_ui),
[fuz_css](https://github.com/fuzdev/fuz_css), and
[Gro](https://github.com/fuzdev/gro).

## License

[MIT](LICENSE)
