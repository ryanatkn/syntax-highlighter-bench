# Prism adapter

## Entry points

| stage | call |
| --- | --- |
| `tokenize` | `Prism.tokenize(text, grammar)` |
| `html` | `Prism.highlight(text, grammar, language)` |

`Prism.tokenize` is the tokens-out call. `Prism.highlight` tokenizes, runs the
hooks grammars register, and stringifies the tokens, so it contains the first
stage as the other libraries' HTML calls do.

`Prism.highlight` returns nested `<span class="token …">` elements with no
`<pre>` or `<code>` wrapper and no per-line element. Consumers supply the
wrapper.

## Import shape

The core file plus one component file per grammar, in dependency order.

```js
import Prism from 'prismjs/components/prism-core.js';
import 'prismjs/components/prism-clike.js';
import 'prismjs/components/prism-javascript.js';
import 'prismjs/components/prism-typescript.js';

export default Prism;
```

This is the narrowest shape. The package's main file, `prism.js`, always
includes markup, CSS, C-like, and JavaScript, and Prism's Node helper
`loadLanguages` reads files at run time, so neither is used.

A component registers itself on the global `Prism` object when it is imported
and reads the grammars it extends from there, so order matters. `bundle_entry`
returns this shape. With no languages it is the core alone.

Bundle size is measured over it, and a built bundle is checked by highlighting
through its default export (`bundle_html`). The components find the core
through the global `Prism` it sets, in a bundle as in the source files, so each
bundle is checked in a process of its own.

## Token count

Every `Token` object, at any depth: a token whose content holds other tokens
counts once, and so does each token inside it. Plain strings between tokens are
not counted. This matches the `<span>` elements `Prism.highlight` emits, except
where a hook adds elements of its own.

## Synchronous

`tokenize` and `highlight` are synchronous. `setup` imports the core and the
components with dynamic imports, which is the only async step.

## Languages

| id | Prism id | components loaded |
| --- | --- | --- |
| `ts` | `typescript` | clike, javascript, typescript |
| `js` | `javascript` | clike, javascript |
| `css` | `css` | css |
| `html` | `markup` | markup, css, clike, javascript |
| `xml` | `xml` | markup |
| `json` | `json` | json |
| `svelte` | `svelte` | markup, css, clike, javascript, prism-svelte |
| `md` | `markdown` | markup, markdown |
| `bash` | `bash` | bash |
| `rust` | `rust` | rust |

- **`svelte` is a third-party grammar**,
  [`prism-svelte`](https://github.com/pngwn/prism-svelte). Prism has none of its
  own. Its version is recorded beside Prism's. The coverage matrix footnotes it. The grammar highlights script content as
  JavaScript, including in a `lang="ts"` script.
- **`xml` is the markup grammar.** The markup component registers a copy of
  itself under the name `xml`, and Prism's language list presents XML that way.
  The coverage matrix footnotes it.
- **`html` loads CSS and JavaScript.** Those components add `<style>` and
  `<script>` highlighting to markup only when they are loaded, and markup with
  the two is what Prism's own default bundle ships.
- **`md` highlights a fenced block only when its language is loaded**, and only
  in `highlight`, through a hook. A timed process sets up only the language it
  measures, so Markdown is measured without embedded-code highlighting, the same
  as in every other library. Prism's Markdown requires markup, so Prism still
  highlights a fence tagged `html`, `xml`, `svg`, or `markup`, and one tagged as
  Markdown.

## Theme CSS

`prismjs/themes/prism.css`, the default theme. It ships unminified and is
measured minified, like every library's stylesheets. It covers one scheme,
light.

## Caveats

- **`tokenize` and `highlight` can disagree on Markdown.** The Markdown
  component highlights the inside of a fenced block in two hooks,
  `after-tokenize` and `wrap`, and only `Prism.highlight` runs hooks:
  `Prism.tokenize` returns the fence's content as one token. So for a fence
  whose language is loaded, the HTML holds elements that the token count does
  not include, and the two numbers of that input describe different amounts of
  work. Under the one-language rule that is a fence tagged `html`, `xml`, `svg`,
  `markup`, or as Markdown. The token count is stated on an input's `tokenize`
  cell and the output size on its `html` cell, each beside the call it comes
  from.
- **The registry is global and only grows.** A second `setup` cannot unload a
  grammar, so languages loaded earlier in the process stay loaded and change
  Markdown's fenced blocks, and add a `title` attribute to every `entity` token
  of any language once markup is loaded. The adapter still refuses any language
  `setup` was not given.
- **A missing grammar would not throw by itself in a useful way**:
  `Prism.tokenize` fails on an undefined grammar with a `TypeError`, and Prism
  ships a `plain` grammar that returns the text untouched. The adapter resolves
  the grammar in `setup` and throws if it is absent.
- In a browser, the core highlights the page by itself on load unless
  `window.Prism = { manual: true }` is set before it is imported.
- The component files ship without types. `prism_modules.d.ts` declares them.
