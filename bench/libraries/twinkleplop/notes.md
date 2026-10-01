# twinkleplop adapter

## Entry points

| stage | call | module |
| --- | --- | --- |
| `tokenize` | `tokenize()(source)` | the language's package, such as `@twinkleplop/typescript` |
| `html` | `language()(source)` | the language's package |

Each language package exports two factories. `tokenize()` returns a function
that runs the grammar and then the language's reclassifier stack, at full
fidelity. `language()` returns a function that does the same and renders HTML.

This is the path a consumer gets, and the one twinkleplop's own comparison
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

`bundle_entry` returns one such line per language. With no languages it exports
`create_language` and `to_html` from `@twinkleplop/core`: what a language
package builds its two factories from. Every language package also imports
`@twinkleplop/core/compile` and `@twinkleplop/core/tokens`, which this floor
leaves out, so the first language carries them.

A language package imports the packages it embeds, so `@twinkleplop/typescript`
brings `@twinkleplop/javascript`, which brings HTML and CSS.

## Token count

`TokenizeResult.tokens` is a `Uint32Array` holding a type, a start, and an end
for each token, so the count is its length over three. Whitespace between tokens
is not a token. A token is one of those entries of three, which is what
twinkleplop's own `TokenView.count` reports, so the count is a third of the
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

twinkleplop has no XML language, so `xml` is unsupported.

Markdown does not highlight the contents of a fenced block: the block is one
token. The other libraries would highlight it when the fence's language is
loaded, but a timed process sets up only the language it measures, so Markdown
is measured without embedded-code highlighting in every library.

## Theme CSS

`@twinkleplop/theme-github`, whose default export is one stylesheet holding the
light and dark palettes. The package also exports `./light` and `./dark`
separately, each smaller.

## Version

The version recorded is that of `@twinkleplop/core`. The language packages are
versioned separately from it, and each one's version is recorded beside it.

## Caveats

- The adapter imports every language package when it loads, and `setup` binds
  only the languages it is given.
