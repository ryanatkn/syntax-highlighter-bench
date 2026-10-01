/**
 * The adapter for Shiki with its Oniguruma wasm engine. See `notes.md` beside it
 * for the entry points and why.
 *
 * @module
 */

import { createOnigurumaEngine } from 'shiki/engine/oniguruma';

import { create_shiki_adapter } from '../shiki.ts';

export const shiki_wasm_adapter = create_shiki_adapter({
	id: 'shiki_wasm',
	label: 'Shiki (wasm)',
	note: "The Oniguruma wasm engine, Shiki's default. The HTML carries inline styles rather than classes.",
	// `shiki/wasm` carries the wasm binary inlined, so nothing is read from disk
	create_engine: () => createOnigurumaEngine(import('shiki/wasm')),
	entry: {
		engine_import: `import { createOnigurumaEngine } from 'shiki/engine/oniguruma';`,
		engine_expression: `createOnigurumaEngine(import('shiki/wasm'))`,
		sync: false
	}
});
