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
```

IMPORTANT for AI agents: Do NOT run `gro dev` — the developer manages the
dev server.

## Status

Built: the language ids, the feature sets, the results schema, and the docs
that describe them. Everything under "Planned" below is design, not code.

## Layout

```
bench/                       the Node harness; never imported by the site
  langs.ts                   the language ids every adapter maps onto
  sets.ts                    the feature sets bundle size is measured over
src/lib/results_schema.ts    zod strict schemas for a results file
src/routes/                  the static SvelteKit site
  docs/                      tomes (overview, languages, results, design) + API docs
src/test/                    vitest tests; `bench/` mirrors the harness
  fixtures/results/          a fixture results file with invented numbers
```

Planned additions: `bench/libraries/<id>/` (one adapter per library),
`bench/corpus/`, the harness entry points, `results/` (committed runs), and
the results pages under `src/routes/`.

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

## Language ids

The harness owns the language ids, in `bench/langs.ts`. `LANG_ROSTER` is the
single table — id, label, and whether the language is timed — and the `Lang`
and `TimedLang` types and the `LANGS` / `TIMED_LANGS` lists derive from it.
Adding a language is one line there.

- **Timed** ids are the ones every library in the starting roster supports, so
  a timed cell is never missing a library by design.
- **Untimed** ids (`xml`) are named by the coverage matrix and feature sets
  only.

**One source of truth.** The results schema does not enumerate language ids.
A results file carries its own `langs` roster, the schema checks every language
reference against that roster, and the site reads the roster from the file. So
the ids live only in `bench/langs.ts`, the site imports nothing from the
harness, and adding an id needs no schema change. The same holds for libraries
(`meta.libraries`) and feature sets (`sets`).

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
validates and throws one readable error.

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
- the unsupported/excluded rules above; a bundle entry holds sizes only when
  the library claims every language of the set, and otherwise names exactly the
  missing ones
- each `startup` entry carries the fields its scenario needs and no others, for
  languages the library claims, and appears once

Every number the site shows must come through this schema.

## Planned

**The adapter contract** is the extension point: one adapter per library,
mapping the language ids onto the library's own (`langs`), tagging its output
shape and engine kind, and exposing `setup`, `tokenize` (returns the token
count), `html`, and `bundle_entry`. Rules: the narrowest entry doing the same
stage as the others; languages declared explicitly, never a plain-text
fallback; token counts recorded rather than equalised; only synchronous paths
timed; browser-safe, no Node-only APIs.

**Method**, following twinkleplop's comparison harness (MIT, credited in the
README): a child process per cell, libraries alternated within rounds with a
rotating start, iterations calibrated per library, collection and rewarm
before each round, an anchor workload to detect machine drift, and a
pre-measurement output check. Timed numbers are published from one named
machine; deterministic numbers regenerate anywhere.

**Corpus**: every input labelled by source — `neutral` (pinned upstream real
code no measured library authored, the primary set), `shiki` (Shiki's own
benchmark samples), `home` (a library's own samples).

## Neutrality

The maintainer of this benchmark also maintains fuz_code, so fairness is
structural: the maintainer's library is flagged (`by_maintainer` in
`meta.libraries`), inputs are labelled by source, adapters document their
entry points for each library's maintainers to review, and the method is
published. Keep site and docs copy neutral — no library gets promotional
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
