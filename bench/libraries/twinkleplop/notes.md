# Twinkleplop adapter

## Entry points

| stage | call | module |
| --- | --- | --- |
| `tokenize` | `tokenize()(source)` | the language's package, such as `@twinkleplop/typescript` |
| `html` | `language()(source)` | the language's package |

Each language package exports two factories. `tokenize()` returns a function
that runs the grammar and then the language's reclassifier stack, at full
fidelity. `language()` returns a function that does the same and renders HTML.

This is the path a consumer gets, and the one Twinkleplop's own comparison
harness measures. The bare grammar without reclassifiers, `tokenize` from
`@twinkleplop/core`, skips the reclassifiers and is not what a language package
ships, so it is not used.

`language()` returns `<pre class="twinkleplop"><code>` with one
`<span class="l">` per line and a `<span class="tok …">` per token. The adapter
passes no render options, so this is the default structure.

## Import shape

One package per language, and the two factories by name.

```js
export { language as typescript_language, tokenize as typescript_tokenize } from '@twinkleplop/typescript';
```

`bundle_entry` returns one such line per language, and a built bundle is checked
by highlighting through the `<name>_language` export (`bundle_html`). With no
languages it exports what every language package is built from:
`create_language` and `to_html` from `@twinkleplop/core`, and `compile` and
`define_grammar` from `@twinkleplop/core/compile`. Every language package
imports the compiler, so with it in the floor, a single language less the floor
is that language's own cost. A maintainer who knows a leaner documented floor
can propose it.

A language package imports the packages it embeds, so `@twinkleplop/typescript`
brings `@twinkleplop/javascript`, which brings HTML and CSS.

## Token count

`TokenizeResult.tokens` is a `Uint32Array` holding a type, a start, and an end
for each token, so the count is its length over three. Whitespace between tokens
is not a token. A token is one of those entries of three, which is what
Twinkleplop's own `TokenView.count` reports, so the count is a third of the
array's length and not the length itself.

## Synchronous

Both factories return synchronous functions. `setup` calls the factories once
per language, outside the timed calls: binding is a one-time cost, and a
consumer binds once rather than per highlight.

## Languages

| id | package |
| --- | --- |
| `ts` | `@twinkleplop/typescript` |
| `js` | `@twinkleplop/javascript` |
| `css` | `@twinkleplop/css` |
| `html` | `@twinkleplop/html` |
| `json` | `@twinkleplop/json` |
| `svelte` | `@twinkleplop/svelte` |
| `md` | `@twinkleplop/markdown` |
| `bash` | `@twinkleplop/bash` |
| `rust` | `@twinkleplop/rust` |

Twinkleplop has no XML language, so `xml` is unsupported.

`@twinkleplop/markdown` depends on no other language. Its factories take the
languages to highlight fenced blocks with (`languages`) and one for front
matter (`front_matter`), and the adapter passes neither, so the contents of a
fenced block are one token. The other libraries would highlight it when the
fence's language is loaded, but a timed process sets up only the language it
measures, so Markdown is measured without embedded-code highlighting in every
library, with the exceptions the Prism and fuz_code notes list.

That holds in a bundle of several languages too: `bundle_entry` exports each
language's factories and wires none into Markdown, so a Twinkleplop bundle
holding Markdown and a fence's language still leaves the fence plain, where
the other libraries highlight it.

## Theme CSS

`@twinkleplop/theme-github`, whose default export is one stylesheet holding the
light and dark palettes. The package also exports `./light` and `./dark`
separately, each smaller (one palette each; the default is what Twinkleplop's
docs import). The default export is what is measured, minified like every
library's stylesheets, and the roster entry records that it covers both
schemes.

## Version

The version recorded is that of `@twinkleplop/core`. The language packages and
the theme package are versioned separately from it, and each one's version is
recorded beside it.

## Caveats

- The adapter imports every language package when it loads, and `setup` binds
  only the languages it is given.
