# Shiki (wasm) adapter

Everything in [the Shiki notes](../shiki_js/notes.md) applies: the entry
points, the languages, the token count, the theme, and the caveats. This adapter
differs only in the engine.

## Engine

`createOnigurumaEngine(import('shiki/wasm'))`, Shiki's default: the Oniguruma
regex library compiled to WebAssembly. Creating it is async, so `setup` awaits
it and the timed calls go through `createHighlighterCoreSync`, as with the
JavaScript engine.

`shiki/wasm` is a JavaScript module with the wasm binary inlined, so the adapter
reads no file and runs in a browser unchanged.

## Import shape

```js
import { createHighlighterCore } from 'shiki/core';
import { createOnigurumaEngine } from 'shiki/engine/oniguruma';
import theme from 'shiki/themes/github-light.mjs';
import typescript from 'shiki/langs/typescript.mjs';

export const highlighter = await createHighlighterCore({
	themes: [theme],
	langs: [typescript],
	engine: createOnigurumaEngine(import('shiki/wasm'))
});
```

This is the shape Shiki documents for a fine-grained bundle. The module awaits
at the top level, because the engine is async.

## Wasm bytes

The wasm binary is reported apart from the JavaScript. In the shape above it
arrives through `shiki/wasm`, inlined as text, which a bundler would count as
JavaScript. Measuring it apart means leaving `shiki/wasm` out of the bundle and
counting the binary, `shiki/onig.wasm`, instead.
