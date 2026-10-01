# syntax-highlighter-bench

> neutral benchmark suite and results site for JavaScript syntax highlighters

Compares [fuz_code](https://github.com/fuzdev/fuz_code),
[twinkleplop](https://github.com/pngwn/twinkleplop),
[Prism](https://github.com/PrismJS/prism), and
[Shiki](https://github.com/shikijs/shiki) on the same inputs. Shiki's
JavaScript engine and its Oniguruma wasm engine are counted as two libraries.
A run produces one results file holding many metrics, and the site is a view
over that file where a reader picks the subset to compare.

**Status: early.** The language ids, the feature sets, and the schema of the
results file exist. The adapters, the corpus, the harness that measures them,
and the results pages are designed but not built, and no numbers are published.

## Layout

- `bench/` — the harness. It runs on Node directly, through type stripping,
  and is never imported by the site.
  - `bench/langs.ts` — the language ids every adapter maps onto
  - `bench/sets.ts` — the feature sets bundle size is measured over
- `results/` — the committed runs, once there are any
- `src/lib/results_schema.ts` — the schema of a results file, written by the
  harness and parsed by the site
- `src/routes/` — the site, static SvelteKit, with the docs under `/docs`

## What is measured

Two classes of number, kept apart in the results file:

- **Machine-dependent**, published only from one named machine: throughput
  for each language, input size, and mode (`tokenize` and `html`); cold start;
  memory.
- **Deterministic**, the same anywhere: bundle size for each feature set, with
  wasm and theme CSS reported separately; output size; token counts; the
  coverage matrix.

**Language ids.** The harness owns them. The timed ids are the ones every
library in the roster supports: `ts`, `js`, `css`, `html`, `json`, `svelte`,
`md`, `bash`, `rust`. `xml` is also an id but untimed, named by the coverage
matrix and the feature sets. A language a library doesn't claim is
_unsupported_; a claimed one whose output fails the pre-measurement check is
_excluded_. The two are recorded differently and neither is ever a zero.

**Feature sets.** A named list of language ids, declared before any numbers
exist so a set can't be chosen to flatter a result: `core` (no languages),
`single:<lang>` for each id, `docs` (what a documentation site imports),
`web_rust` (footnoted as fuz_code's full set), and `all`.

## Adding a library

Planned: each library is measured through one adapter, a directory under
`bench/libraries/` that maps the language ids onto the library's own, exposes
its tokens-out and HTML-out entry points, and says how to bundle it. An adapter
exposes the narrowest entry doing the same work as the others, declares its
languages explicitly, never falls back to plain text, and times only synchronous
paths. The results file carries the roster of libraries, so the site needs no
change.

## Neutrality

The maintainer of this benchmark also maintains fuz_code, so fairness has to be
structural. By design:

- the maintainer's library is flagged in the results file and on the site
- every input is labelled by its source — real code no measured library
  authored, Shiki's own benchmark samples, or a library's own samples — and
  the first is the primary set
- each adapter documents the entry points it uses, so a library's maintainers
  can review or replace it
- the method and the commands to reproduce a run are published with the numbers

## Credit

The measurement method follows the comparison harness of
[twinkleplop](https://github.com/pngwn/twinkleplop) (MIT): a process per cell,
libraries rotated within rounds, iterations calibrated per library, token
counts recorded, and machine drift detected.

## Develop

Requires Node >= 24.14.

```bash
npm i
npm run dev # or `gro dev`
gro check   # typecheck, test, lint, format check
gro build   # build the static site
```

Built with [SvelteKit](https://github.com/sveltejs/kit),
[Svelte](https://github.com/sveltejs/svelte),
[fuz_ui](https://github.com/fuzdev/fuz_ui),
[fuz_css](https://github.com/fuzdev/fuz_css), and
[Gro](https://github.com/fuzdev/gro).

## License

[MIT](LICENSE)
