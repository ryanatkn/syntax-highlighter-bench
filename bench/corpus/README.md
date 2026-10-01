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

The neutral inputs are the primary set. The others are kept and labelled so a
reader can see whether a result holds on inputs a library chose for itself.

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

An input is `synthetic` when it is not one real file: it was built by joining
or repeating files to reach its size. Real files are preferred, and a synthetic
one is used only where a real file of the size doesn't exist.

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

## The manifest

Each entry holds:

- `file` — the path within this directory, which identifies the input
- `source`, `home`, `lang` — read off the path
- `size`, `bytes`, `lines`, `sha256` — derived from the file
- `synthetic` — written by hand
- `provenance` — written by hand: the upstream files the input came from, each
  with its repository, commit, path, hash, and license. Empty for a harness
  input. One entry means a verbatim copy, whose hash must equal the input's.
  Several mean a synthetic input and what it was built from. A verbatim copy
  can itself be synthetic, when the upstream built the file by joining or
  repeating others.

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
```

The tests run the same check as `corpus:check`. The two commands that need
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
