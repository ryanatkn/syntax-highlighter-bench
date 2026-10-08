# Corpus

The inputs the benchmark measures. `manifest.json` lists every one with its
size, hash, and origin, and [INPUTS.md](INPUTS.md) is the same list as a table.

The files here are data. They are kept byte for byte, and no formatter, linter,
or type checker runs on them.

## Sources

An input's directory names its source, and every result carries that label.

| directory | source | what it holds |
| --- | --- | --- |
| `neutral/<lang>/` | `neutral` | real files from projects that no measured library authored, at a small, a medium, and a large size for each timed language |
| `shiki/<lang>/` | `shiki` | the sample files Shiki's own benchmark uses, from `shikijs/textmate-grammars-themes` |
| `home/<library>/<lang>/` | `home` | a measured library's own samples: home turf for that library |
| `harness/<lang>/` | `harness` | one short snippet per language, written for this benchmark |
| `stress/<lang>/` | `stress` | inputs that look for each library's worst cases, minified from neutral inputs or generated here |

The neutral inputs are the primary set. The others are kept and labelled so a
reader can see whether a result holds on inputs a library chose for itself, or
on hostile ones. No summary pools two sources.

- **`home/fuz_code/`** is fuz_code's `sample_complex` test fixtures.
- **`home/twinkleplop/`** is the `sized` family of twinkleplop's benchmark
  corpus, which its published comparison measures, and its `real` family. twinkleplop
  builds most of these by joining or repeating smaller files, and those are
  marked synthetic. The note on each entry is twinkleplop's own description.
- **`harness/`** snippets were written by this benchmark's maintainer, who also
  maintains fuz_code. They are the docs-site case, a few lines of ordinary code,
  and are labelled apart from the neutral set for that reason.

## Size tiers

An input's tier comes from its size in bytes, never from its name:

| tier | size |
| --- | --- |
| `micro` | under 600 bytes |
| `small` | 600 bytes to under 3,200 |
| `medium` | 3,200 bytes to under 32,000 |
| `large` | 32,000 bytes and over |

`small`, `medium`, and `large` centre on roughly 1KB, 10KB, and 100KB, split at
the geometric midpoints. `large` has no upper bound, and the neutral large
inputs range from about 90KB to several hundred KB, so compare throughput in
MB/s across languages, not time per call. `micro` is a snippet of a few lines, where the fixed
cost of a call outweighs the scanning.

## Synthetic inputs

An input is `synthetic` when it is not one real file as published: it was built
by joining or repeating files to reach its size, or derived from one (the
minified stress inputs). Real files are preferred, and a synthetic one is used
only where a real file of the size or shape doesn't exist.

`neutral/svelte/harvest.svelte` is the one synthetic neutral input. Svelte
components of around 100KB are rare, so `bench/corpus_harvest_svelte.ts` builds
one from several real components of a few projects: it splits each into its
module script, instance script, markup, and style block, and emits one of each
block holding the bodies in order, verbatim, with a comment naming each
component. The emitted tags are `<script lang="ts" module>`,
`<script lang="ts">`, and a plain `<style>`, so a `lang` on a source style block
is dropped. The result has the shape of one large component and is lexically
well formed, but it is not a working component and Svelte's parser rejects it:
unrelated scripts share one scope, so their imports and declarations collide.
No source is rewritten to avoid that. The manifest lists every component it is
built from.

## Stress inputs

`stress/` is the output of `bench/corpus_stress.ts`, written by this
benchmark's maintainer, who also maintains fuz_code. The script owns the directory:
regenerating writes every file it makes, removes any other, and updates the
manifest. Never edit a file there; change the generator and regenerate. No
measured library authored any of them, and none is tuned to a library: a library
that fails the output check or crawls on one is a finding, recorded as an
exclusion or a slow number, not a reason to soften the input.

- **Derived** — a neutral input transformed the way real code ships: the
  JavaScript and the CSS minified by esbuild through Vite's
  `transformWithEsbuild` (the call the bundle sizes use), and the JSON parsed and
  serialized again with no whitespace. Each comes out as one long line. The
  sources are picked so the result stays under the large neutral inputs: the
  large JavaScript input (the medium one minifies to a few KB), the medium
  stylesheet (the large one stays several hundred KB), and the large JSON input.
  A derived input keeps its source's pins as provenance, is marked synthetic, and
  names its transformation in `derivation`, with the esbuild version where
  esbuild made it: another esbuild may minify to other bytes, so a new version
  fails the check until the inputs are regenerated.
- **Written** — a pathological file generated here, small to medium, for each
  timed language: statements, values, and types nested far deeper than code is
  written; one line of ordinary TypeScript tens of KB long; an unterminated
  string and block comment near the top of a JavaScript file; template literals
  nested inside substitutions; Markdown lists nested deep with emphasis, link,
  and code delimiters that never close, where a backtracking pattern retries at
  every opener; HTML with unclosed tags and unquoted attributes; a selector list
  on one long line and CSS nested deep; Svelte logic blocks nested deep; Bash
  substitutions and expansions nested deep; and Rust's nesting block comments,
  generics, and raw strings. Each file's first comment says what it stresses (all
  but the JSON, which has none). No provenance.

Shiki is timed with its per-line time limit out of reach, as on every input, so
on a stress input it highlights every line in full. With Shiki's default limit
(500ms per line), a line that takes longer comes back with its rest as one plain
token: a consumer with default options gets that fallback, not the stress
number.

## The manifest

Each entry holds:

- `file` — the path within this directory, which identifies the input
- `source`, `home`, `lang` — read off the path
- `size`, `bytes`, `lines`, `sha256` — derived from the file
- `synthetic` — written by hand
- `provenance` — written by hand: the upstream files the input came from, each
  with its repository, commit, path, hash, and license. Empty for a harness
  input and a written stress input, and only for those. One entry with no
  derivation means a verbatim copy, whose hash must equal the input's. Several
  mean a synthetic input and what it was built from. A verbatim copy can itself
  be synthetic, when the upstream built the file by joining or repeating others.
- `derivation` — how a derived stress input was made from its pin, naming the
  tool and its version; null for every other input

The stress generator writes the three hand-written fields of its own inputs, and
`corpus:manifest` carries them forward like any other.

`corpus_hash` is derived from every input's path, language, and hash. A run
records it, so two runs over different corpora are never compared as one.

## Commands

```bash
npm run corpus:manifest   # regenerate manifest.json and INPUTS.md from the files
npm run corpus:check      # fail if either is stale, or a copy differs from its pin
npm run corpus:fetch      # re-download neutral inputs that are missing or changed, verifying each against its pin
npm run corpus:fetch -- --check   # download every neutral input and compare, writing nothing
npm run corpus:harvest -- --repos <dir>           # rebuild neutral/svelte/harvest.svelte
npm run corpus:harvest -- --repos <dir> --check   # fail if it would change
npm run corpus:stress                             # regenerate stress/, then the manifest and INPUTS.md
npm run corpus:stress -- --check                  # fail if a stress file or its entry would change
```

The tests run the same checks as `corpus:check` and `corpus:stress -- --check`.
`corpus:check` alone can't verify a derived input, whose hash isn't its pin's:
only regenerating it can. The two commands that need
something outside this repository are run by hand: `corpus:fetch` needs the
network, and `corpus:harvest` needs `<dir>` to hold each harvested project in a
directory named after its repository, at the pinned commit.

## Adding an input

1. Put the file at `<source>/<lang>/<file>`, unmodified.
2. Add an entry to `manifest.json` with its `file` and `provenance`: the
   repository, the full commit, the path there, the file's SHA-256, and the
   license. The other fields are derived.
3. Run `npm run corpus:manifest`.

## Licenses

Every copied file stays under its upstream license, recorded in its
`provenance`:

- `neutral/` — see [neutral/NOTICE.md](neutral/NOTICE.md)
- `shiki/` — MIT, from
  [shikijs/textmate-grammars-themes](https://github.com/shikijs/textmate-grammars-themes),
  see [shiki/LICENSE](shiki/LICENSE)
- `home/fuz_code/` — MIT, see [home/fuz_code/LICENSE](home/fuz_code/LICENSE)
- `home/twinkleplop/` — MIT, see [home/twinkleplop/LICENSE](home/twinkleplop/LICENSE)
- `stress/` — a derived input stays under its neutral source's license (see
  [neutral/NOTICE.md](neutral/NOTICE.md)); a written one is this repository's
