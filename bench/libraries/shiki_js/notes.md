# Shiki adapters

Shiki is measured as two libraries, as twinkleplop's comparison harness does: `shiki_js` uses
the JavaScript regex engine and `shiki_wasm` the Oniguruma engine compiled to
WebAssembly. They share grammars, theme, and every call below, in
`bench/libraries/shiki.ts`. Only the engine differs.

## Entry points

| stage | call |
| --- | --- |
| `tokenize` | `highlighter.codeToTokensBase(code, { lang, theme })` |
| `html` | `highlighter.codeToHtml(code, { lang, theme })` |

`codeToTokensBase` is Shiki's lowest-level public tokenizer: the TextMate
grammar walk, with each token's color resolved against one theme. Shiki has no
public call that tokenizes without a theme, so this stage includes color
resolution, which the class-based libraries leave to CSS.

`codeToHtml` returns `<pre class="shiki …" style="…"><code>` with one
`<span class="line">` per line and a `<span style="color:…">` per token. The
colors are inline, so there is no stylesheet and the output is tagged
`inline_styles`.

## Import shape

Shiki's fine-grained bundle: the core, one engine, one theme, and one module
per language.

```js
import { createHighlighterCoreSync } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import theme from 'shiki/themes/github-light.mjs';
import typescript from 'shiki/langs/typescript.mjs';

export const highlighter = createHighlighterCoreSync({
	themes: [theme],
	langs: [typescript],
	engine: createJavaScriptRegexEngine()
});
```

`bundle_entry` returns this shape. With no languages it still holds the core,
the engine, and the theme, since Shiki cannot produce output without a theme.
Bundle size is measured over it, and a built bundle is checked by highlighting
through its `highlighter` export (`bundle_html`).

The `shiki/langs/*.mjs` and `shiki/themes/*.mjs` paths re-export
`@shikijs/langs` and `@shikijs/themes`. They are used because `shiki` is the
installed dependency. The bundles `shiki`, `shiki/bundle/web`, and
`shiki/bundle/full` load languages lazily from a full catalog and are not used.

A language module's default export lists the grammar and the grammars it
embeds, so loading Svelte loads JavaScript, TypeScript, CSS, and PostCSS.

## Token count

Every token of every line. Shiki's tokens cover the whole line, so runs of
whitespace and unstyled text are tokens too, unlike in the other libraries.

## Synchronous

`createHighlighterCoreSync`, `codeToTokensBase`, and `codeToHtml` are
synchronous. `setup` does the async work first: it imports the theme and the
language modules, and creates the engine.

## Languages

| id | Shiki id |
| --- | --- |
| `ts` | `typescript` |
| `js` | `javascript` |
| `css` | `css` |
| `html` | `html` |
| `xml` | `xml` |
| `json` | `json` |
| `svelte` | `svelte` |
| `md` | `markdown` |
| `bash` | `shellscript` |
| `rust` | `rust` |

- **`xml` embeds Java.** Shiki's XML grammar lists the Java grammar as embedded,
  so it loads with it and is part of any set holding `xml`. The coverage matrix
  footnotes it.
- **`md` highlights a fenced block only when its language is loaded.** The
  Markdown grammar lists the fence languages as lazily embedded. A timed process
  sets up only the language it measures, so Markdown is measured without
  embedded-code highlighting, as in the other libraries, apart from the
  exceptions in the Prism notes.

## Theme

`github-light`, the theme twinkleplop's comparison harness uses for Shiki. One
theme must be bundled for Shiki to produce output, so every bundle figure
includes it, the `core` set too. It is the only theme measured: themes differ
in size, and a smaller one would lower the bundle figure, and change how many
distinct colors the HTML carries.

Shiki has no stylesheet, so its theme CSS figure is null: its theme lives in the
JavaScript figure, and its colors in the HTML, on every token. The theme covers
one scheme, light.

## Caveats

- **The per-line time limit is put out of reach.** Shiki stops tokenizing a line
  after `tokenizeTimeLimit` milliseconds, 500 by default, and returns the rest
  of the line as one token without saying so. What a call returns then depends
  on how fast the machine is at that moment: a first call in a cold process on
  a busy machine came back with fewer tokens than the next call on the same
  input. The benchmark needs every call to do the same work, and a token count
  that is the same anywhere, so the adapter passes a `tokenizeTimeLimit` no line
  can reach, to every call. It is not 0, which turns the limit off: Shiki reads
  the clock before every match only while a limit is set, so 0 would also skip
  work that the default does, and read faster than a consumer with default
  options gets. Where the default limit would not have been reached, the output
  and the work are the same. This matters most on the stress inputs: on a line
  long enough, the default limit would cut highlighting off, so a stress number
  measures full highlighting that a consumer with default options would not
  get.
- **Shiki falls back to plain text for the names `text`, `plaintext`, `txt`,
  and `plain`, and for a missing `lang` option**, returning one token per line.
  The adapter maps only its declared ids and refuses any language `setup` was
  not given. Shiki itself throws for an unknown name.
- The JavaScript engine is created with its defaults, which reject a pattern it
  cannot translate rather than skipping it.
- The two engines don't always agree on scopes. On `neutral/bash/nvm.sh` they
  return the same tokens and HTML of the same size, but one token's color
  differs (the closing `esac` of the large `case` in `nvm()`). The output check
  and the deterministic file compare counts and sizes, not content, so a
  difference like this is not flagged. Timing compares the same work, not
  identical output.
- Shiki also offers precompiled grammars with a smaller raw JavaScript engine
  for this engine. They come from a package that is not installed here, so the
  adapter uses the standard grammars.
