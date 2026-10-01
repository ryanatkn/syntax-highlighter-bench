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
```

IMPORTANT for AI agents: Do NOT run `gro dev` — the developer manages the
dev server.

## Status

Built: the adapter contract and the adapters, the roster, the output check,
the corpus and its manifest, the language ids, the feature sets, the results
schema, and the docs that describe them. Everything under "Planned" below is
design, not code: nothing is timed yet and no run exists.

## Layout

```
bench/                       the Node harness; never imported by the site
  adapter.ts                 the adapter contract and its rules
  libraries.ts               the roster: every adapter, in display order
  libraries/<id>/            one adapter per library: adapter.ts + notes.md
  libraries/shiki.ts         what the two Shiki adapters share
  library_info.ts            Node side of an adapter: versions, theme CSS, roster + coverage
  check_output.ts            the pre-measurement output check
  corpus.ts                  the corpus manifest: schema, build, load
  corpus_manifest.ts         CLI: regenerate or check the manifest
  corpus_fetch.ts            CLI: download inputs by their pins and verify them
  corpus_harvest_svelte.ts   CLI: build the synthetic large Svelte input
  corpus/                    the inputs, by source then language; manifest.json, INPUTS.md
  langs.ts                   the language ids every adapter maps onto
  sets.ts                    the feature sets bundle size is measured over
src/lib/results_schema.ts    zod strict schemas for a results file
src/routes/                  the static SvelteKit site
  docs/                      tomes (overview, adapters, corpus, languages, results, design) + API docs
src/test/                    vitest tests; `bench/` mirrors the harness
  fixtures/results/          a fixture results file with invented numbers
```

Planned additions: the timed harness entry points, the bundle and cold-start
measurements, `results/` (committed runs), and the results pages under
`src/routes/`.

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
  only. twinkleplop has no XML language; the other adapters claim it.

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
| machine-dependent | each cell's `values` (timing, memory); the `startup` section |
| deterministic     | each cell's `tokens` and `output`; `bundle`; `coverage`     |

`startup`, `bundle`, and `cells` may be empty, `meta.noise_floor` is null
until the machine is calibrated, and `meta.anchor` may be null only when the run
timed nothing (no cell `values`, no `startup`). `BenchResults` also checks that
the sections agree with each other:

- ids are unique and every reference resolves to a roster entry — except a
  cell's `home`, which may name a library outside the run's roster
- no two cells measure the same input in the same mode, and a set lists each
  language once
- every cell's `file` names an entry of `inputs`, and the cell describes the
  input as that entry does
- the unsupported/excluded rules above; a bundle entry holds sizes only when
  the library claims every language of the set, and otherwise names exactly the
  missing ones
- each `startup` entry carries the fields its scenario needs and no others, for
  languages the library claims, and appears once

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
| `setup(langs)` | loads exactly these languages, once, before any timing |
| `tokenize(src, lang)` | the timed tokens-out call; returns the library's own result |
| `count_tokens(tokens)` | counts a `tokenize` result; never timed |
| `html(src, lang)` | the timed HTML-out call |
| `bundle_entry(langs)` | source of a module importing exactly these languages |

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
  `bench/library_info.ts`.

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
(twinkleplop's language packages, `prism-svelte`); their versions land in the
roster entry's `extra_packages`.

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

## Planned

**Method**, following twinkleplop's comparison harness (MIT, credited in the
README): a child process per cell, libraries alternated within rounds with a
rotating start, iterations calibrated per library, collection and rewarm
before each round, an anchor workload to detect machine drift, and the output
check above run before measuring. Timed numbers are published from one named
machine; deterministic numbers regenerate anywhere.

**Bundle size** over each feature set, from a build of each adapter's
`bundle_entry`, with wasm and theme CSS reported apart from the JavaScript.

**Cold start**, from a bare import through to the first highlight.

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
7.x.

## Project standards

- TypeScript strict mode
- Svelte 5 with runes API
- tsv (`gro format`) with tabs, 100 char width
- Node >= 24.14
- Tests in `src/test/`, vitest with `assert`
- Private package (not published to npm)
