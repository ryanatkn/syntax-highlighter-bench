# syntax-highlighter-bench

> neutral benchmark suite and results site for JavaScript syntax highlighters

syntax-highlighter-bench (`@ryanatkn/syntax-highlighter-bench`) compares
fuz_code, twinkleplop, Prism, and Shiki on the same inputs. Shiki's JavaScript
engine and its Oniguruma wasm engine count as two libraries. A run produces one
results file holding many metrics; the site is a view over that file where a
reader picks the subset to compare.

For coding conventions, see Skill(fuz-stack).

## Gro commands

```bash
gro check     # typecheck, test, lint, format check (run before committing)
gro typecheck # typecheck only (faster iteration)
gro test      # run tests with vitest
gro build     # build for production (static adapter)
gro deploy    # build, commit, and push to deploy branch
gro sync      # regenerate files and run svelte-kit sync
gro format 'bench/**/*' # format the harness (plain `gro format` covers `src/`)
npm run corpus:check    # the corpus manifest matches the files and their pins
npm run corpus:manifest # regenerate the manifest and the inputs table
npm run bench:smoke     # every library on every cell and cold-start scenario once, in parallel
npm run bench -- --machine <name>           # a full timed run, written to results/
npm run bench:calibrate -- --machine <name> # the machine's noise floor
node bench/run.ts --machine <name> --plan   # what a run would do, measuring nothing
node bench/run.ts --machine <name> --resume # continue a timed run that was stopped
node bench/run.ts --metrics startup --libraries prism --langs json --startup-samples 2 # a small cold-start run, to results/scratch/
npm run bench:deterministic             # regenerate results/deterministic.json
npm run bench:deterministic -- --check  # fail if the committed file differs from what regenerates
```

IMPORTANT for AI agents: Do NOT run `gro dev` — the developer manages the
dev server.

## Status

Built: the adapter contract and the adapters, the roster, the output check,
the corpus and its manifest, the language ids, the feature sets, the results
schema, the timed harness with its cold-start scenarios, the deterministic
metrics (bundle size, token counts, output sizes, coverage) with their
committed results file, and the docs that describe them. Everything under "Planned" below is design, not code. No
timed run is committed and no timed numbers are published. The committed
`results/deterministic.json` is data: never put a measured number in the docs.

## Layout

```
bench/                       the Node harness; never imported by the site
  adapter.ts                 the adapter contract and its rules
  libraries.ts               the roster: every adapter, in display order
  libraries/<id>/            one adapter per library: adapter.ts + notes.md
  libraries/shiki.ts         what the two Shiki adapters share
  library_info.ts            Node side of an adapter: versions, theme CSS, roster + coverage
  check_output.ts            the pre-measurement output check
  deterministic.ts           CLI: the deterministic results file — build, write, `--check`, and what a timed run carries from it
  sizes.ts                   bundle size: build and minify a bundle entry, compress, the wasm and theme CSS columns
  bundle_check.ts            one built bundle, imported in a process of its own and made to highlight its languages
  outputs.ts                 token counts and output sizes: one process per library and language, folded into cells
  node_child.ts              runs a harness script in a Node process and reads the JSON it prints
  run.ts                     CLI: a timed run — spawns the processes, assembles and writes the results file
  run_options.ts             a run's flags, parameters, cell and process plan, and output path (pure)
  cell.ts                    one library on one cell, in a process of its own: setup, output check, measurement
  coldstart.ts               cold start: the scenarios, the generated process of one sample, its check, the stats
  journal.ts                 the journal of a timed run: header, entries, read, append, header diff
  measure.ts                 the timing engine: calibration, collections, timed batches, pooled stats
  anchor.ts                  the reference workload that detects machine drift
  lock.ts                    the machine-wide lock
  corpus.ts                  the corpus manifest: schema, build, load
  corpus_manifest.ts         CLI: regenerate or check the manifest
  corpus_fetch.ts            CLI: download inputs by their pins and verify them
  corpus_harvest_svelte.ts   CLI: build the synthetic large Svelte input
  corpus/                    the inputs, by source then language; manifest.json, INPUTS.md
  langs.ts                   the language ids every adapter maps onto
  sets.ts                    the feature sets bundle size is measured over
results/                     where runs are written; `deterministic.json` is committed; `scratch/` (git-ignored) holds smoke and filtered ones; a journal (git-ignored) sits beside an unfinished run
src/lib/results_schema.ts    zod strict schemas for a results file
src/routes/                  the static SvelteKit site
  docs/                      tomes (overview, adapters, corpus, languages, method, deterministic, results, design) + API docs
src/test/                    vitest tests; `bench/` mirrors the harness
  fixtures/results/          a fixture results file with invented numbers
```

Planned additions: committed timed runs in `results/`, and the results pages
under `src/routes/`.

## The harness runs on Node directly

`bench/*.ts` is executed by Node through type stripping, with no build step and
no flags. Every module there must hold to:

- erasable syntax only — no enums, parameter properties, or namespaces
  (`erasableSyntaxOnly` in `tsconfig.json` enforces it)
- relative imports with explicit `.ts` extensions — no `$lib` or other aliases,
  which Node doesn't resolve
- `import type` (or inline `type`) for types

The site never imports from `bench/`. The harness may import
`src/lib/results_schema.ts`, which depends only on zod.

`gro check` typechecks and lints `bench/`, but `gro format` sweeps only `src/`
and the root config files. `src/test/bench/format.test.ts` fails when a harness
file is unformatted; fix it with the command above.

**`bench/corpus/` is data, not code.** It holds `.ts`, `.svelte`, `.css`, and
other source files that are measured byte for byte, so every tool is kept off
it: `.formatignore`, the `exclude` in `tsconfig.json`, the `ignores` in
`eslint.config.js`, the format test's glob, and `-text` in `.gitattributes`.
A formatter run over a corpus file changes its hash, which `corpus:check` and
the tests report as a copy that no longer matches its pin. Never edit a file
there; replace it and update its pin.

## Language ids

The harness owns the language ids, in `bench/langs.ts`. `LANG_ROSTER` is the
single table — id, label, and whether the language is timed — and the `Lang`
and `TimedLang` types and the `LANGS` / `TIMED_LANGS` lists derive from it.
Adding a language is one line there.

- **Timed** ids are the ones every library in the starting roster supports, so
  a timed cell is never missing a library by design.
- **Untimed** ids (`xml`) are named by the coverage matrix and feature sets
  only. twinkleplop has no XML language; the other adapters claim it. A
  cold-start `lang` or `first_highlight` entry names a timed language (the
  schema rejects an untimed one); a `set` entry names a feature set, which may
  hold an untimed language.

**One source of truth.** The results schema does not enumerate language ids.
A results file carries its own `langs` roster, the schema checks every language
reference against that roster, and the site reads the roster from the file. So
the ids live only in `bench/langs.ts`, the site imports nothing from the
harness, and adding an id needs no schema change. The same holds for libraries
(`meta.libraries`), feature sets (`sets`), and corpus inputs (`inputs`).

A library missing from a comparison is in one of two states, distinct end to
end:

- **unsupported** — the adapter doesn't claim the language: no entry in
  `coverage`, and a bundle entry of `{unsupported: [lang]}` for sets that need
  it
- **excluded** — the adapter claims the language but failed the
  pre-measurement output check: an entry in `meta.excluded`

Neither is ever a zero or a geomean input. The schema rejects numbers for an
unclaimed language, numbers for an excluded library, an excluded entry for
an unclaimed language, and a cell for an untimed language.

Cold start keeps the same two apart. **Unsupported**: the library doesn't claim
a language of the scenario, so the scenario is never planned and has no entry
anywhere (`plan_startup_scenarios` names it, and `--plan` prints it).
**Excluded**: the scenario's first process failed its check, so it has an entry
in `meta.startup_excluded` with the reason and none in `startup`.

Library and language ids are lowercase names (`[a-z][a-z0-9_]*`), enforced by
the schema, so they are safe as record keys and path segments.

## Feature sets

`bench/sets.ts` declares `FEATURE_SETS`: named lists of language ids that
bundle size is measured over, fixed before any numbers exist so a set can't be
tuned to flatter a result. Adding a set is one line.

- `core` — no languages: the runtime floor
- `single:<lang>` — generated for each language id; `single − core` is that
  language's incremental cost
- `docs` — what a documentation site imports, matching twinkleplop's docs
  bundle
- `web_rust` — labelled "web + rust", footnoted as fuz_code's full set (home
  turf); named by content because the site is neutral
- `all` — every language id

## Results schema

`src/lib/results_schema.ts` exports zod `strictObject` schemas, each with a
type of the same name. `BenchResults` is the whole file; `parse_bench_results`
validates and throws one readable error. `BenchInput` is also the shape of a
corpus manifest entry.

Two classes of number, kept apart:

| class             | where                                                       |
| ----------------- | ----------------------------------------------------------- |
| machine-dependent | each cell's `values` (timing, memory); the `startup` section (cold start: time and memory) |
| deterministic     | each cell's `tokens` and `output`; `bundle`; `coverage`     |

A cell states each deterministic number once for its input, on the cell whose
call returns it: `tokens` on the `tokenize` cell and `output` on the `html`
cell, the other being empty there. `to_bench_cell` (`bench/outputs.ts`) builds
every cell, for the timed harness and the deterministic pass alike.

**A deterministic-only file** has no cell `values` and no `startup`. Its
`meta.run`, `meta.anchor`, `meta.generated_at`, `meta.machine`, `meta.node`,
and `meta.commit` are null: they say where timed numbers came from, and the
schema requires each as soon as a file has any. A timestamp or a commit would
also make the committed file change on every regeneration, and a commit can't
name the tree it is itself committed in. `meta.bundler` (`BenchBundler`: the
versions of Vite, Rollup, and esbuild, and the compression levels) is set
exactly when `bundle` is not empty.

`startup`, `bundle`, and `cells` may be empty, `meta.noise_floor` is null
until the machine is calibrated, and `meta.anchor` may be null only when the run
timed nothing (no cell `values`, no `startup`). `meta.run` (`BenchRun`) says
how the timed numbers were measured — the kind of run (`full`, `smoke`,
`calibrate`), passes, rounds and durations, the retries allowed, the
loaded-language rule, how cold start was sampled (`startup_samples`,
`startup_discard`, `startup_compile_cache`), the filters, how many segments
it was measured in, and the duration — and may be null only when nothing was
timed. `bench_run_is_complete` is a run that isn't smoke and has no filter:
what it set out to cover. `bench_results_find_gaps` lists what a file's cells
lack to have covered it, and `bench_results_find_startup_gaps` what its cold
start lacks; `BenchResults` rejects a complete run with a cell gap, and a
complete `full` run with a cold-start gap. `bench_results_is_publishable` adds
that it is `full`, has neither gap, its anchor is stable, and its commit isn't
dirty. The site should use the latter
and never restate it. `meta.commit` is a full hash, with `-dirty` appended when
the working tree had uncommitted changes.

A gap, checked from the file alone: a roster library that claims a cell's
language and has neither a value nor a `meta.excluded` entry there, or a listed
input of a timed language without a cell in every mode the file's cells use.
The modes come from the cells, not from `BenchMode`, so adding a mode to the
harness doesn't make earlier files unparseable. What the file can't show is an
input missing altogether, or a whole mode: `inputs` lists what was measured,
and only `corpus_hash` names the corpus. The harness plans from the manifest,
so its own runs have neither.

A cold-start gap, also from the file alone: the `bare` baseline, and for each
roster library in each form `core`, `lang` and `first_highlight` for every
timed language it claims, and `set` for every feature set the file's cold start
names whose languages it all claims, each with an entry in `startup` or in
`meta.startup_excluded`. The sets come from the file, as the modes do, which is
its limit: a file with every `set` entry removed names no set and still reads
as complete. A calibration measures no cold start, and the schema rejects one
that has any. `startup_samples`, `startup_discard`, and `startup_compile_cache`
are null exactly when the run measured no cold start (a calibration, or
`--metrics throughput`).

`filters.metrics` (`BenchRunMetric`: `throughput`, `startup`) is a filter like
the others (naming both parses to null, so it is no filter): a run that left one out is not complete, is written to
`results/scratch/`, and must hold nothing of what it left out. `libraries` and
`langs` narrow the cold-start scenarios too; `sizes`, `modes`, and `sources`
select inputs, which cold start has none of.

A cell value's `attempts` is how many times the library was measured there (1
unless retried), and is at most `meta.run.retries + 1`. The value's spread and
percentiles are the kept attempt's alone. In a calibration file the values, and
so their `attempts`, are the first arm's.

A cell's id is `<file>:<mode>`, built by `to_bench_cell_id` and enforced by the
schema; `meta.excluded` refers to cells by it. `BenchResults` also checks that
the sections agree with each other:

- ids are unique and every reference resolves to a roster entry — except a
  cell's `home`, which may name a library outside the run's roster
- no two cells measure the same input in the same mode, and a set lists each
  language once
- every cell's `file` names an entry of `inputs`, and the cell describes the
  input as that entry does
- the filters in `meta.run` describe the file: no repeated id, every cell
  inside them, `meta.libraries` exactly the libraries filter when it is set
- a smoke run carries no noise floor, no retries, and one segment
- no value has more attempts than the run's retries allow
- a run with no filters and timed cells has no gap (above)
- the unsupported/excluded rules above; a bundle entry holds sizes only when
  the library claims every language of the set, and otherwise names exactly the
  missing ones
- `bundle` covers every library over every set or is empty; a `gzip` or
  `brotli` size is at most `raw` plus a format's own overhead
  (`to_max_compressed_bytes`: a few bytes compress to slightly more); `css` is
  null exactly for an `inline_styles` library
- a deterministic-only file with cells is complete
  (`bench_results_find_gaps(results, 'deterministic')`): every claiming library
  has the number each cell states or an `excluded` entry, and every listed
  input has a cell in each mode
- `tokens` only on `tokenize` cells and `output` only on `html` cells, and a
  library with a value in a cell has that cell's deterministic number
- a value's `p10_ns` is at most its `p90_ns`, and an anchor's `stable` is
  exactly a drift under `BENCH_ANCHOR_STABLE_BELOW`, which lives in the schema
  so the harness and the check can't disagree
- each `startup` entry carries the fields its scenario needs and no others, for
  languages the library claims, and appears once, as a number or as a
  `meta.startup_excluded` entry and never both (one key set covers the two
  lists); a scenario of one language names a timed one; every entry keeps
  exactly `meta.run.startup_samples` samples; `median_ms` lies between `p10_ms`
  and `p90_ms`

`BenchBundleEntry` is a union with an error of its own: an entry with an
`unsupported` key is reported against that shape and anything else against the
sizes shape, so a malformed entry never reads as a bare "Invalid input".

Every number the site shows must come through this schema.

## Adapters

`bench/adapter.ts` declares `HighlighterAdapter`, the extension point. One
adapter per library lives at `bench/libraries/<id>/adapter.ts` with a
`notes.md` beside it, and `bench/libraries.ts` lists them in `ADAPTERS`. Adding
a library is a devDependency, a directory, and one roster line.

| member | what it is |
| --- | --- |
| `id`, `label`, `package`, `by_maintainer`, `note` | the roster entry; the version is read from `package`'s manifest |
| `extra_packages` | optional: separately versioned packages whose versions are recorded too |
| `langs` | harness id to library id; an absent language is unsupported |
| `via` | a coverage footnote for a claimed language |
| `output`, `engine` | filterable tags: classes or inline styles, and how it lexes |
| `theme_css` | module specifiers of the default theme's stylesheets, or null |
| `theme_schemes` | the color schemes that default theme covers |
| `wasm` | optional: the wasm binaries the library loads, each as the import that inlines it and the binary's own specifier |
| `setup(langs)` | loads exactly these languages, once, before any timing |
| `tokenize(src, lang)` | the timed tokens-out call; returns the library's own result |
| `count_tokens(tokens)` | counts a `tokenize` result; never timed |
| `html(src, lang)` | the timed HTML-out call |
| `bundle_entry(langs)` | source of a module importing exactly these languages |
| `bundle_html(exports, src, lang)` | highlights through the exports of a module built from `bundle_entry`; never timed |
| `bundle_html_source(lang)` | the call `bundle_html` makes, as an expression over `exports` and `src`: what a cold-start process runs, since it can't load the adapter |

The rules, stated in the module's doc comment and enforced by
`src/test/bench/adapters.test.ts`:

- **Same stage** — the narrowest public entry doing the same work as the
  others. `notes.md` says which call and why it is comparable.
- **Explicit languages, no plain-text fallback** — a call for a language
  outside `langs`, or one `setup` wasn't given, throws `LangNotSetUpError`. The lookup of what was
  set up has no prototype (`create_lang_map`), so no string reaches the library
  by accident. Several libraries render names like `text` as plain text.
- **Token counts recorded, not equalised** — `count_tokens` is separate from
  `tokenize` so counting is never inside a timed call.
- **Synchronous timed paths** — async loading happens in `setup`.
- **Browser-safe** — no `node:` import, no Node global, no file access in
  anything under `bench/libraries/`, `bench/adapter.ts`, or
  `bench/check_output.ts`. Disk access on a library's behalf goes in
  `bench/library_info.ts` and `bench/sizes.ts`.

**The loaded-language rule: a timed cell's process calls
`adapter.setup([cell.lang])` exactly once, for every library.** `setup` decides
more than what is callable: a language that embeds others by name highlights
them only when they are loaded (Markdown fenced blocks in fuz_code, Prism, and
Shiki; never in twinkleplop). Under the rule no library loads another language
for Markdown fences, which matches the `single:<lang>` sets. Structural embeds (`<script>`
and `<style>` in HTML and Svelte) are always loaded with their language. Two
exceptions come from what loads with Markdown itself: Prism's Markdown depends
on its markup grammar, so Prism still highlights a fence tagged `html`, `xml`,
`svg`, or `markup`, and fuz_code and Prism highlight a fence tagged as Markdown.

`extra_packages` on an adapter names packages versioned apart from `package`
(twinkleplop's language packages and its theme package, `prism-svelte`); their
versions land in the roster entry's `extra_packages`. A test fails when a
stylesheet or wasm binary comes from a package that isn't recorded.

**Shiki's per-line time limit is out of reach, not off.** Shiki stops
tokenizing a line after `tokenizeTimeLimit` (500ms by default) and returns the
rest as one token, so a cold first call on a busy machine returned fewer tokens
than the next call. A token count has to be the same anywhere, so
`bench/libraries/shiki.ts` passes a `tokenizeTimeLimit` no line can reach to
every call (not 0, which would also skip the clock read Shiki's default does
before every match, and read faster). Don't remove it: the deterministic file
and the count check inside a timed batch both depend on it.

**`library_info.ts`** builds `meta.libraries` (`to_bench_libraries`) and
`coverage` (`to_bench_coverage`) from the adapters, validated by the schema, and
throws when a version can't be read.

## Output check

`check_output(adapter, lang, src, min_span_kinds?)` in `bench/check_output.ts`
runs before a library is measured. It returns a `Result`: the token count and
HTML size on success, or `{ok: false, reason}` for `meta.excluded`. It fails
when `tokenize` or `html` throws, when no tokens come back, when the HTML is
empty, or when the HTML has fewer distinct kinds of `<span>` than the floor.

Two floors, used in order by a harness:

1. **The snippet gate, per (library, lang)**: the language's harness snippet,
   under `setup([lang])`, must reach `MIN_SNIPPET_SPAN_KINDS`. The snippets are
   written dense in syntax so that real highlighting clears it and a fallback
   doesn't. A library that fails is excluded from the language.
2. **The per-input floor**: each input must reach `MIN_SPAN_KINDS`. This one is
   low because prose-heavy Markdown legitimately has few kinds, so it can't tell
   that from Shiki's fallback (a line wrapper plus one default-colour span). The
   gate can.

It throws, rather than failing, for a language the adapter doesn't claim (that
is unsupported, not excluded) and rethrows `LangNotSetUpError` (that is the
caller's mistake, and must not become a quiet exclusion). A new harness snippet
must stay syntax-dense: every adapter has to clear the gate on it.

The tests run it for every adapter on every corpus input of every language it
claims, so a library that would be excluded somewhere fails the suite first.

## Corpus

`bench/corpus/` holds the inputs, at `<source>/<lang>/<file>` or
`home/<library>/<lang>/<file>`. See `bench/corpus/README.md` for the sources,
tiers, and commands, and the generated `bench/corpus/INPUTS.md` for the list.

- **Sources**: `neutral` (pinned real files no measured library authored, the
  primary set), `shiki` (Shiki's benchmark samples), `home` (a library's own
  samples), `harness` (micro snippets written here).
- **Tiers** come from byte size alone (`to_size_tier`, limits in
  `SIZE_TIER_LIMITS`).
- **`manifest.json`** is the list of `BenchInput` entries plus `corpus_hash`.
  Size, lines, hash, and tier are derived; `synthetic` and `provenance` are
  hand-written and carried forward by `npm run corpus:manifest`.
- **Provenance** is a list of pins (repository, commit, path, hash, license).
  None for a harness input. One means a verbatim copy whose hash must match.
  Several mean a synthetic input and its constituents. A verbatim copy can
  itself be synthetic, when the upstream built the file by joining or repeating
  others.
- **`corpus_fetch.ts`** downloads a single-pin input from its commit and
  verifies the hash; **`corpus_harvest_svelte.ts`** builds the one synthetic
  neutral input from the components listed in `SVELTE_HARVEST_SOURCES`. Both
  need something outside the repo (the network, a checkout of the harvested
  projects), so they are run by hand and not by the tests.

`src/test/bench/corpus.test.ts` rebuilds the manifest from disk and compares it
to the committed one, so a file added, removed, or changed without regenerating
fails the suite.

## Deterministic metrics

`node bench/deterministic.ts` measures everything that is the same on any
machine and writes `results/deterministic.json` through `BenchResults`. It
times nothing and takes no machine lock. `--check` regenerates in memory and
exits 1 with the places that differ (`diff_json`, which names a cell by its id)
when the committed file is stale; `--out <path>` reads and writes another file.
The committed file must be diff-clean: regenerate it whenever a library
version, the corpus, a feature set, an adapter's `bundle_entry`, or Vite
changes, and commit the result.

**Bundle size** (`bench/sizes.ts`, `measure_bundles`). For each adapter and
each set of `FEATURE_SETS`:

- `find_missing_langs` names the set's languages the adapter doesn't claim; if
  any, the entry is `{unsupported: [...]}` and nothing is built.
- `build_bundle` bundles `adapter.bundle_entry(set.langs)` with Vite's build API
  in library mode (ES, `write: false`, no source map, `minify: false`), then
  minifies the chunk once, whole, with Vite's `transformWithEsbuild`
  (`minify: true`). Library mode never minifies the whitespace of an ES chunk,
  whatever `build.minify` says, so the second step is what makes the figure a
  minified one. A non-library build would minify in one step, but it wraps a
  dynamic import in Vite's preload helper, which is bytes no library ships.
- The entry is a virtual module whose id sits under `bench/`, served by a
  plugin: its imports resolve from this repo's `node_modules`, and no path of
  the machine reaches the output.
- `measure_compressed` reports raw, gzip (`GZIP_LEVEL`), and brotli
  (`BROTLI_QUALITY`) bytes with Node's zlib.
- `measure_wasm` measures each `adapter.wasm[].binary` as the JavaScript is
  measured (`BenchByteSizes`: raw, gzip, brotli), null for a library with none.
  The matching `import` is made external to the build, and `build_bundle`
  throws if the bundle never imports it, or leaves out anything else.
- `measure_theme_css` minifies each `theme_css` stylesheet with the same esbuild
  and measures it the same way. Null when `theme_css` is null: the theme is
  then in the JavaScript. Files served apart are compressed apart and summed
  (`sum_byte_sizes`).
- `adapter.theme_schemes` lands on the roster entry: the color schemes the
  default theme covers. A stylesheet with a light and a dark palette is larger
  than one with one, so the site must show it beside the stylesheet sizes.
- Each bundle is written to
  `node_modules/.cache/syntax-highlighter-bench/bundles/<library>/<set>.mjs`
  (`.mjs`, since nothing above that directory says what a `.js` file is, and
  Node would have to detect the format by compiling it) and
  `bench/bundle_check.ts` imports it in a process of its own and calls
  `adapter.bundle_html` for each language of the set on its harness snippet,
  requiring `MIN_SNIPPET_SPAN_KINDS`, and that evaluating
  `adapter.bundle_html_source` returns the same HTML. For a `single:<lang>` bundle it then
  calls `adapter.setup([lang])` and requires the bundle's HTML to equal
  `adapter.html`: the floor alone passes a language that lost what it embeds
  (HTML with the markup lexer only), which is a much smaller bundle. Sets of
  several languages keep the floor only, since a Markdown fence is highlighted
  there and not under one loaded language. The directory is under
  `node_modules` so the external wasm import still resolves and no tool sweeps
  the bundles; open one there to see exactly what was measured. A process per
  bundle, because a bundle may register globally (Prism's components read the
  global `Prism`).

**What makes the sizes deterministic, and what would break it.**

- Vite takes its resolve conditions from `NODE_ENV`, and a test runner sets it.
  `build_bundle` sets it to `production` for the build and restores it, and a
  plugin hook throws unless the resolved config is a production one. Without
  that a build under vitest bundles a library's development build.
- No hashed file names, banner, or source map: one chunk under a fixed name,
  never written by Vite.
- The versions of Vite, Rollup, and esbuild are in `meta.bundler`, and a test
  compares the committed file's with the installed ones.
- The gzip and brotli sizes depend on the zlib and brotli inside Node. That is
  not recorded, since a file naming a Node version would differ between
  machines that compress identically. The check workflow pins the Node version,
  and a failed `--check` whose only differences are compressed sizes says so.

**Token counts and output sizes** (`bench/outputs.ts`). `measure_outputs` spawns
`node bench/outputs.ts '<spec>'` for every library and timed language, several
at a time. A process sets up exactly that language, runs the snippet gate
(`check_snippet`), then `check_output` on every input of the language: the same
functions under the same setup as a timed cell. One language per process,
always: Prism's registry is global and only grows. `to_deterministic_cells`
folds the results into cells with no `values`, and an `excluded` entry for each
cell of an input a library failed on.

**Coverage** is `to_bench_coverage` over the adapters. The footnote text lives
only in each adapter's `via`.

**A timed run and the deterministic file** (`carry_deterministic`). `plan_run`
reads `deterministic.json` from the results directory. If it describes the run
(every library of the run at the same version with the same extra packages, the
same corpus hash, the same sets) the run carries it. Otherwise a smoke or
filtered run logs why and its `bundle` is empty, and a `full` run with no
filters is refused with exit 2 before measuring, `--plan` included:
regenerating the file takes seconds and the run is long. A calibration goes
ahead without it. A file that isn't a results file is refused with exit 2.
When carried:

- `assemble_results` copies the `bundle` entries of the run's libraries and
  `meta.bundler` from it. The timed harness never builds a bundle.
- Each library's first result on a cell is compared with the file as it arrives
  (`assert_matches_deterministic`, wired into `create_agreement_check`): passed
  or excluded, token count, output size. A difference is a `RunError` with exit
  2, before the result is journaled.

So there is one source for each number: cell numbers come from `check_output`
in the process that measured the cell and must equal the file's, and bundle
sizes come from the file. The smoke run is therefore also a check of the
committed file against every real process.

Tests use a results directory of their own. `src/test/bench/run.spawn.test.ts`
runs its small smoke run against the committed file, and
`src/test/bench/sizes.test.ts` and the `prepare_startup` tests in
`src/test/bench/coldstart.test.ts` hold the only tests that run a real build.

**CI** (`.github/workflows/check.yml`): one job on the pinned Node version runs
`gro check`, `npm run bench:deterministic -- --check`, and `npm run
bench:smoke`, in that order so the smoke run's cold start finds the bundles
built. Nothing after `npm ci` needs the network or a checkout of the corpus
sources.

## Timed harness

`node bench/run.ts` is a run; `node --expose-gc bench/cell.ts '<spec>'` is one
library on one cell, which only the parent spawns. The anchor and the lock
follow twinkleplop's comparison harness (MIT), and the timing engine is adapted
from it; a process per library, rather than per cell, is a change made here.
The credit is in the README and in the doc comments of `bench/run.ts`,
`bench/cell.ts`, `bench/measure.ts`, and `bench/anchor.ts`, the last of which is
a port. Statistics come from
fuz_util's `stats.js` and terminal formatting from its `time.js`. Its
`BenchmarkStats` and `benchmark_format_*` don't fit: they drop outliers and
report a mean over many samples, and here a sample is a whole round and the
rounds are few.

**One process, one library.** Every number is one library alone in a fresh
process, so the roster can't move another library's number. Two effects made
that necessary, both found by measuring a library alone against the same
library beside others:

- libraries that share code change how V8 optimises it for each other (Shiki's
  two engines share its tokenizer core, and the JavaScript engine read far
  slower beside the wasm one)
- V8 sizes its young generation from recent allocation, so a library's time on
  a large input depended on which libraries ran beside it

Don't pin V8's heap with flags to tame this: the defaults are what a consumer
gets. `load_adapter` imports only the one adapter module, so the process's
memory is that library's too. Never import `bench/libraries.ts` from
`bench/cell.ts`.

**A cell process** (`bench/cell.ts`, `run_cell`), in order:

1. `adapter.setup([lang])` — the loaded-language rule.
2. The output check: the snippet gate on the language's harness snippet, then
   the per-input floor on the cell's input. A failure is returned as excluded
   with its reason and the library is not timed. A `LangNotSetUpError`
   propagates and crashes the process: that is a harness bug. The token count
   and HTML size come from this check.
3. `measure_call` (`bench/measure.ts`) on `create_timed_call`.
4. One `CellResult` printed as JSON on stdout, and nothing else: the rounds'
   times, the iterations, the token count and output size, and the process's
   peak resident size (`process.resourceUsage().maxRSS`, which is in kilobytes).
   On a small input that peak follows what the warmup and the batches allocated
   more than what the library holds, so the docs point readers at the
   cold-start entries for memory.

**The timed call** (`create_timed_call`) is the same for every library. In
`html` mode it reads one character of the returned string. fuz_code,
twinkleplop, and Prism return a rope (an unflattened concatenation), which is
cheap to build and which a consumer pays to flatten on first use; Shiki's is
already flat. Reading a character flattens it inside the clock (a cost
set by the size of the output, not by the library, so it weighs most on the
fastest one), and the
character is added to a module-level sink: a read whose result is unused is
dropped once V8 optimises the call, and the string then stays a rope. A test
asks V8 (`%StringIsFlat`) that the call's result is flat for every adapter, cold
and optimised. In
`tokenize` mode nothing is lazy: every adapter returns materialized arrays.

**The timing engine** (`measure_call`), in order:

1. Warm the library for `warmup_ms`.
2. Calibrate the iterations: when the warmup showed one call exceeds the target,
   use that; otherwise estimate a call from batches that grow until one is long
   enough. `to_iterations` gives the calls that fill `target_ms`, at least
   `MIN_ITERATIONS` while they fit in `MAX_MEASUREMENT_MS`, and one when two
   calls no longer fit in it.
3. For each round: a full collection, a rewarm of `rewarm_ms` (at least one
   call), a minor collection, then the timed batch. The batch keeps its last
   result; after the clock stops the result is counted, and a count unlike the
   checked one throws (Shiki stops silently at its per-line time limit).

The rewarm is longer than the warmup because libraries recover from a forced
collection at different speeds, Shiki more slowly than the others, and a
library still recovering when its batch is timed reads slow. It is long enough
that every library in the roster has recovered: don't shorten it without
checking the slowest recoverer. `MeasureDeps` (clock, collector) is injected so
the engine is tested with a fake clock; `create_measure_deps` throws without
`--expose-gc`.

**A run** (`bench/run.ts`, `run_bench`):

- `parse_run_args`, `plan_cells`, and `plan_processes` (`bench/run_options.ts`)
  turn the flags into options, the cell list, and the process list: cell by
  cell, `passes` passes each, every library once per pass, with the library a
  pass starts with rotating from pass to pass and cell to cell. An unknown flag
  or id exits 2.
- `plan_run` decides everything before measuring and changes nothing on disk:
  the cells and processes, the machine, the commit, the output and journal
  paths, the journal to resume, and the noise floor to carry. It refuses, with
  exit 2, an unnamed machine, an empty or directory `--out`, an output or
  journal directory that isn't writable, an existing
  `results/<date>_<machine>.json`, a journal without `--resume` (saying what
  the journal records) or `--resume` without a journal, a journal whose header
  differs or that holds a result the plan could never ask for
  (`find_unplanned_result`), and a calibration file that doesn't parse. `--plan` prints it (`format_run_plan`, with
  `estimate_run_ms`) and stops there. `run_bench` then makes the directory and
  takes the machine lock.
- `read_commit` runs in `plan_run`, before any anchor reading, on purpose: the
  anchor reads several percent slower after a process's first spawn, so every
  reading must come after one.
- A timed run spawns one process at a time with `spawnSync`, so the parent has
  no timers and does no work while a process measures. It yields to the event
  loop between processes so a signal can stop the run. A smoke run alone spawns
  asynchronously, as many processes at a time as the machine has cores.
- `read_cell_result` turns how a process ended into its `CellResult` or a
  `RunError` naming the cell and library: failed, timed out, interrupted,
  or printed anything but one valid result. A process's stderr is logged even
  when it succeeds.
- `run_cells_in_turn` drives a timed run cell by cell: the planned passes, then
  the retries (below). Each result is checked against the library's earlier
  ones on the cell as it arrives (`assert_passes_agree`: excluded or not, the
  token count, the output size, across passes, arms, and attempts), so a
  disagreement stops the run at that cell. What it asks for next depends only
  on the results so far, which is what lets a journal be replayed through it.
- `plan_run` also decides what the run takes from the deterministic results
  file (see Deterministic metrics): `--plan` prints whether the bundle sizes
  are carried, and the run logs why when they aren't.
- `assemble_results` groups the results by cell and library and
  `combine_passes` pools them: for each attempt `summarize_passes` takes the
  median, p10/p90, and spread over the rounds of every pass, the median of the
  passes' iterations, and the largest peak RSS, and `select_attempt` keeps one
  attempt. The file is written atomically, and it is the value `BenchResults`
  parsed.
- `RunError.exit_code` is 2 when the caller must change something (flags, a
  missing `--machine`, a held lock, an output path, a journal, filters matching
  nothing), the signal's code when interrupted (`SIGNAL_EXIT`), and 1
  otherwise.
- `RunBenchOptions` lets tests pass a lock path, a results directory, a logger,
  `prepare_startup`, and for a timed run `spawn_cell`, `spawn_startup`, and
  `measure_anchor`, so the journal, resume, and retry paths are tested end to
  end with invented process results (`src/test/bench/run.journal.test.ts`, and
  `src/test/bench/run.startup.test.ts` for cold start).

**The journal and `--resume`** (`bench/journal.ts`, `measure_segment` in
`bench/run.ts`). A timed run appends each process's result to a JSON-lines file
beside its output (`to_journal_path`: `<out>.journal.jsonl`, or
`<kind>_<machine>.journal.jsonl` in the results directory, which carries no
date so a run resumed on a later day finds it). Smoke runs keep none.

- The first line is a `JournalHeader`: the kind, the parameters with retries
  and the cold-start samples and discarded rounds, the filters, the corpus hash, each library's id, version, and extra packages,
  the machine's name, CPU, and governor, the OS release, the Node version, the
  `NODE_OPTIONS` the processes inherit, the commit with its dirty marker, and
  `generated_at`. Two dirty trees at one commit look the same to it, so a resume
  from a dirty tree logs that it can't vouch for the changes. `diff_journal_header` compares every field
  but `generated_at`, and any difference refuses the resume by name. Add a
  field there whenever something new can change what is measured; a test fails
  if a header field goes uncompared.
- Then, for each segment (one stretch of measuring): a `segment` line with the
  opening anchor reading, a `result` line per cell process (pass, attempt, the
  `CellResult`), a `startup` line per cold-start process (round, the
  `StartupResult`), and an `anchor` line with the closing reading. Every line
  carries milliseconds since its segment started, so duration survives a stop.
- A line is one `appendFileSync` plus `fsyncSync`, between processes only. A result
  is journaled after it passes the agreement check, so a disagreeing result is
  never kept.
- A resume replays the journaled results through `run_cells_in_turn` in place
  of their processes and spawns the rest.
- A last line with no newline is a crash mid-append: it is dropped and the file
  cut back to its last whole line before appending. A whole line that doesn't
  parse refuses the journal.
- However a segment ends (finished, a `RunError`, or the `exit` a signal handler
  causes) one `close()` takes its closing anchor reading, closes the journal,
  and releases the lock, and a stopped one says how to resume. A SIGKILL leaves
  no closing reading.
- A segment whose `lock.release()` reports the lock was lost may have overlapped
  another run. On every path `close()` renames its journal to
  `<journal>.overlapped` (`OVERLAPPED_SUFFIX`), which no run resumes, the
  message says so, and no results file is written.
- The assembled file records `segments`, `generated_at` from the first segment
  (so a full run's dated name is the day it started), `duration_ms` summed over
  segments, and an anchor over every reading.
- The journal is removed after the results file is renamed into place. If that
  write fails, the temp file is removed, the journal stays, and a resume writes
  the file without measuring anything.

**Retries.** After a cell's planned passes, each library whose pooled `spread`
there exceeds `DISTURBED_SPREAD` (`passes_are_disturbed`) is measured again,
every pass (`plan_retry`), up to `retries` times and until an attempt isn't
disturbed. `select_attempt` keeps the attempt with the lowest spread, the
earliest on a tie, and never looks at the times: selecting on speed would bias
retried numbers toward fast and favour whichever library is noisier. `attempts`
on the value says how many there were, and the summary counts them for each
library. Retries are journaled like any result, with their attempt number.
Smoke runs don't retry.

**Cold start** (`bench/coldstart.ts`, with the processes run by `bench/run.ts`).
The scenario set and method generalise twinkleplop's cold-start harness (MIT,
credited in the README and the module's doc comment).

- **A sample is one fresh Node process**, and a scenario is what it does:
  `bare` (nothing), `core` (import the `core` set's entry), `lang` (import
  `single:<lang>`, per timed language claimed), `set` (import `docs`,
  `STARTUP_SET_ID`), `first_highlight` (import `single:<lang>` and highlight
  the language's harness snippet once). `plan_startup_scenarios` lists them
  with what each library doesn't support.
- **Through `bundle_entry`, never the adapter modules**: the fuz_code and
  twinkleplop adapters import every language statically, which would charge a
  library for languages the scenario doesn't load. So a first highlight can't
  call `adapter.bundle_html`; it runs `adapter.bundle_html_source(lang)`, which
  the bundle check ties to `bundle_html`.
- **Two forms.** `bundled` imports the chunk in the bundles cache, the one whose
  size the deterministic file reports. Unbundled imports
  `adapter.bundle_entry(langs)` written verbatim to
  `node_modules/.cache/syntax-highlighter-bench/startup/<library>/<set>.entry.mjs`,
  so its bare specifiers resolve from this repo's `node_modules`.
- **`prepare_startup`** writes everything before any process starts, under the
  machine lock: each scenario's module (`to_startup_child_source`), the
  unbundled entries, and any bundle that is missing or isn't the size the
  carried deterministic file reports (raw and gzip), built with the same
  `build_bundle`. A bundle that still differs after building stops the run with
  exit 2. Without a carried file every bundle is rebuilt, since nothing says a
  cached one is this tree's. Files are written only when their content changes,
  and by rename, so a run in progress never reads half a file.
- **The process** is the generated module, run with no flags
  (`spawn_startup_sync`): a static import of the entry, for a first highlight
  the call on a source embedded as a literal and one character of the HTML
  read, then `performance.now()`, which counts from the process's start. After
  the clock it reads `maxRSS` (before touching stdout, which loads stream
  modules) and prints one `StartupChildOutput`. Never add harness imports,
  flags, or work before the clock to it: `bare` is that module with no import,
  and is what a reader subtracts.
- **Compile cache off**: `to_startup_env` sets `NODE_DISABLE_COMPILE_CACHE=1`
  and drops `NODE_COMPILE_CACHE`. Node enables the cache only when asked, and
  the variable refuses `module.enableCompileCache()` too. Every sample reports
  `getCompileCacheDir()`, and a non-null one is a `RunError`.
- **Rounds** (`plan_startup_round`, `run_startup_in_turn`): every scenario once
  a round, slot by slot (a slot is the libraries of one scenario and form), the
  library a slot starts with rotating by round and by slot; `startup_discard`
  rounds thrown away, then `startup_samples` kept (`FULL_PARAMS`; a smoke run
  takes one sample and discards none, several processes at a time).
- **The check** (`read_startup_result`, `check_startup_output`,
  `create_startup_check`): a scenario's first process decides. A process that
  fails on its own, an entry with no exports, or a first highlight under
  `MIN_SNIPPET_SPAN_KINDS` excludes the library from the scenario, which is
  then not run again; `bare` failing is a `RunError`, and so is any process
  ended by a signal or an exit code past 128 (killed, crashed, the heap limit's
  abort): the machine ended it, so the run fails and stays resumable, and the
  scenario is never dropped. A first highlight's HTML
  size must equal the deterministic file's for the library on that snippet
  (exit 2 otherwise), and every later sample must be a sample of the same HTML.
- **No retries**, deliberately: a disturbance lands on one sample of every
  scenario, the median sets it aside, and re-sampling one scenario later would
  take it out of the interleaving. **No noise floor** either: a calibration
  plans no cold start (`run_measures`).
- **In the run**: after the cells, in the same segment — same lock, same anchor
  bracket, journaled as `startup` lines keyed by scenario and round, replayed
  on `--resume` like cell results, and assembled by `to_startup_entries` into
  `startup` and `meta.startup_excluded`. `--metrics` leaves either part out,
  and `--plan` prints the scenarios, the processes they add, and the estimate
  (`estimate_startup_ms`).
- **Numbers** (`summarize_startup`): `median_ms`, `p10_ms`, `p90_ms`, `spread`
  (slowest over fastest, wide by nature here), `samples`, and `rss_peak_bytes`
  as the median of the processes' peaks. `maxRSS` is kilobytes on Linux, which
  is the only platform checked.

**Kinds of run and where they are written** (`to_results_path`):

| run | parameters | written to |
| --- | --- | --- |
| `full`, no filters | `FULL_PARAMS` | `results/<UTC date it started>_<machine>.json` |
| `--calibrate`, no filters | `FULL_PARAMS`, twice the passes | `results/calibration_<machine>.json` |
| `--smoke`, or any filtered run | `SMOKE_PARAMS` for smoke | `results/scratch/<kind>_<machine>.json` |

`results/scratch/` is git-ignored, so a run that isn't complete can't be
committed by accident. `--machine` is required for the first two rows, with or
without `--out`, since the name is published; otherwise it defaults to the
hostname. `read_commit` ignores `results/` when deciding whether the tree is
dirty, so committing a calibration and then running doesn't mark the run.

**Calibration.** A `calibrate` run gives every library twice the passes and
splits them alternately into two arms, each exactly what a full run measures.
`to_noise_floor` takes each pair's ratio: `per_cell` is the 95th percentile of
the deviation `max(r, 1/r) − 1` over cells and libraries, and `geomean` is the
deviation of a library's geometric mean of ratios, for the library where it is
largest. The arms are separate processes, so the floor includes
process-to-process variation. The cells of a calibration file carry the first
arm, and `meta.run.passes` is one arm's passes. Each arm is retried on its own
(`to_arm_count`, `PassUnit`), by the rule a full run applies to a library: the
rule reads only that arm's rounds, never the distance between the arms, so it
can't steer the floor, and the floor describes a full run with the same
retries. Retrying both arms together on their pooled spread would select for
the arms agreeing, which is the thing being measured. A `full` run carries the
floor of `results/calibration_<machine>.json` when `carry_noise_floor` accepts
it: unfiltered, anchor stable, same machine name, CPU, governor, Node version,
corpus hash, and parameters, retries included. Otherwise `meta.noise_floor` is
null and the run logs why.

**The anchor** (`bench/anchor.ts`): a deterministic workload with no measured
library in it, read before the first process and after the last of every
segment. `to_anchor_drift` takes every reading: `drift` is the relative change
between the two that differ most, earlier to later, and `stable` is a drift
under `BENCH_ANCHOR_STABLE_BELOW` (in the schema, which checks the two agree).
With two readings that is the plain change. It only brackets what was measured,
so the summary also lists every library-cell whose `spread` still exceeds
`DISTURBED_SPREAD` after its retries.

**The lock** (`bench/lock.ts`): an exclusively created file in the OS temp
directory naming the holder's process, held for as long as a segment
measures. A second run is refused with exit 2 and the holder's pid. A lock whose
process is gone is taken over. `release` reports whether the lock was still
this process's, and a run that lost it writes nothing. Tests pass their own
lock path and results directory to `run_bench`, so `gro check` neither takes
nor waits on the machine's.

**Keep the spawning tests few.** `src/test/bench/run.spawn.test.ts` is the only
file that starts processes, and each costs a Node start. How a process's ending
is read is tested without one, through `read_cell_result`, and a whole timed
run through the `spawn_cell` seam.

## Planned

Timed numbers are published from one named machine; deterministic numbers
regenerate anywhere. The results pages render a results file, cold start
included.

## Neutrality

The maintainer of this benchmark also maintains fuz_code, so fairness is
structural: the maintainer's library is flagged (`by_maintainer` in
`meta.libraries`), inputs are labelled by source with the neutral set primary,
adapters document their entry points for each library's maintainers to review,
and the method is published. Snippets written here are labelled `harness`,
never `neutral`. Keep site and docs copy neutral — no library gets promotional
wording.

## Dependencies

The measured libraries are devDependencies: `@fuzdev/fuz_code`, `prismjs`
(with `@types/prismjs` and `prism-svelte`), `shiki`, and `@twinkleplop/core`
with its per-language packages and `@twinkleplop/theme-github`. Vite stays on
7.x, and it is also what builds the measured bundles: a Vite upgrade changes
the committed sizes.

## Project standards

- TypeScript strict mode
- Svelte 5 with runes API
- tsv (`gro format`) with tabs, 100 char width
- Node >= 24.14
- Tests in `src/test/`, vitest with `assert`; `src/test/bench/run.spawn.test.ts`
  holds the tests that start real processes, the cold-start ones included
- Private package (not published to npm)
