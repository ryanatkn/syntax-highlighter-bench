# fuz_code adapter

[fuz_code](https://github.com/fuzdev/fuz_code) is maintained by the maintainer
of this benchmark, and is flagged as such in every results file.

## Entry points

| stage | call | module |
| --- | --- | --- |
| `tokenize` | `SyntaxStyler#lex(text, lang)` | `@fuzdev/fuz_code/syntax_styler.js` |
| `html` | `SyntaxStyler#stylize(text, lang)` | `@fuzdev/fuz_code/syntax_styler.js` |

`lex` runs the language's hand-written lexer and returns a flat event stream in
one `Int32Array`. It is the narrowest public tokens-out call: `stylize` is
`lex` followed by the renderer, so the two stages nest the same way as in the
other libraries.

`stylize` returns nested `<span class="token_…">` elements with no `<pre>` or
`<code>` wrapper and no per-line element. Consumers supply the wrapper.

## Import shape

A fresh `SyntaxStyler` with only the needed `lexer_*` modules registered, each
imported by its own path. The adapter does not use `syntax_styler_global`, which
registers every language.

```js
import { SyntaxStyler } from '@fuzdev/fuz_code/syntax_styler.js';
import { lexer_ts } from '@fuzdev/fuz_code/lexer_ts.js';

export const syntax_styler = new SyntaxStyler();
syntax_styler.add_lang(lexer_ts);
```

`bundle_entry` returns this shape. With no languages it is the styler alone.
Bundle size is measured over it, and a built bundle is checked by highlighting
through its `syntax_styler` export (`bundle_html`).

## Token count

One token per typed event: a leaf, or the opening of a container. A container
and each token inside it count separately, which matches the elements in the
HTML one for one. Untyped text between events is not a token. Adjacent leaves
of one type are merged by the lexer, so a run like `});` is one token.

## Synchronous

The whole API is synchronous. `setup` only builds the styler.

## Languages

| id | fuz_code id | lexers registered |
| --- | --- | --- |
| `ts` | `ts` | `lexer_ts` |
| `js` | `js` | `lexer_ts` |
| `css` | `css` | `lexer_css` |
| `html` | `html` | `lexer_markup`, `lexer_ts`, `lexer_css` |
| `xml` | `xml` | `lexer_xml` |
| `json` | `json` | `lexer_json` |
| `svelte` | `svelte` | `lexer_svelte`, `lexer_ts`, `lexer_css` |
| `md` | `md` | `lexer_md` |
| `bash` | `bash` | `lexer_bash` |
| `rust` | `rust` | `lexer_rust` |

- **`js` runs the TypeScript lexer.** fuz_code has no separate JavaScript lexer
  and registers `js` as an alias of `ts`. The coverage matrix footnotes it.
- **`html` and `svelte` register the lexers they embed.** A lexer looks up an
  embedded language in the styler's registry and leaves the region as plain
  text when it is missing. The library does not declare these dependencies, so
  the adapter does: `<script>` and `<style>` content is part of the language,
  and the other libraries load it too. The cost is that `single:html` includes
  the TypeScript and CSS lexers.
- **`md` highlights a fenced block only when its language is registered.** A
  timed process sets up only the language it measures, so Markdown is measured
  without embedded-code highlighting, the same as in every other library. A
  fence tagged `md` is the exception: the Markdown lexer is loaded, so it is
  highlighted.

## Theme CSS

`@fuzdev/fuz_code/theme.css` and `@fuzdev/fuz_code/theme_variables.css`. The
theme reads its colors from custom properties that
[fuz_css](https://github.com/fuzdev/fuz_css) defines, and
`theme_variables.css` defines them for a page without fuz_css. Both are counted:
together they are the theme of a standalone page, in a light and a dark scheme. The dark palette applies through `light-dark()`, so the page sets
`color-scheme`.
They are measured minified, like every library's stylesheets.

## Caveats

- The adapter guards the language itself: registering `lexer_ts` also
  registers the `js` alias, and the adapter still refuses `js` unless `setup`
  was given it.
