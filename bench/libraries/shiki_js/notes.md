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
  embedded-code highlighting, the same as in every other library.

## Theme

`github-light`, the theme twinkleplop's comparison harness uses for Shiki. One
theme must be bundled for Shiki to produce output, and which one is an open
choice: themes differ in size, and a theme changes how many distinct colors the
HTML carries. A smaller theme would lower the bundle figure.

## Caveats

- **Shiki falls back to plain text for the names `text`, `plaintext`, `txt`,
  and `plain`, and for a missing `lang` option**, returning one token per line.
  The adapter maps only its declared ids and refuses any language `setup` was
  not given. Shiki itself throws for an unknown name.
- The JavaScript engine is created with its defaults, which reject a pattern it
  cannot translate rather than skipping it.
- Shiki also offers precompiled grammars with a smaller raw JavaScript engine
  for this engine. They come from a package that is not installed here, so the
  adapter uses the standard grammars.
