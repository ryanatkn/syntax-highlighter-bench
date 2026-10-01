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
plain-text fallback, the language ids, the feature sets, and the schema of the
results file exist. The harness that times the libraries, the bundle and
cold-start measurements, and the results pages are designed but not built, and
no numbers are published.

## Layout

- `bench/` — the harness. It runs on Node directly, through type stripping,
  and is never imported by the site.
  - `bench/adapter.ts` — the contract every library is driven through
  - `bench/libraries.ts` — the roster, and `bench/libraries/<id>/` — one
    adapter per library, with notes on the entry points it uses
  - `bench/check_output.ts` — the check each library passes before it is measured
  - `bench/corpus/` — the inputs, with their manifest
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

The measurement method follows the comparison harness of
[twinkleplop](https://github.com/pngwn/twinkleplop) (MIT): a process per cell,
libraries rotated within rounds, iterations calibrated per library, token
counts recorded, and machine drift detected. The adapter rules come from the
same harness.

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
```

Built with [SvelteKit](https://github.com/sveltejs/kit),
[Svelte](https://github.com/sveltejs/svelte),
[fuz_ui](https://github.com/fuzdev/fuz_ui),
[fuz_css](https://github.com/fuzdev/fuz_css), and
[Gro](https://github.com/fuzdev/gro).

## License

[MIT](LICENSE)
