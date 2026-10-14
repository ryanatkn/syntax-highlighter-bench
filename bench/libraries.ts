/**
 * The roster: every library the benchmark measures, in display order. Adding a
 * library is a directory under `bench/libraries/` and one line here.
 *
 * @module
 */

import type { HighlighterAdapter } from './adapter.ts';
import { fuz_code_adapter } from './libraries/fuz_code/adapter.ts';
import { prism_adapter } from './libraries/prism/adapter.ts';
import { shiki_js_adapter } from './libraries/shiki_js/adapter.ts';
import { shiki_wasm_adapter } from './libraries/shiki_wasm/adapter.ts';
import { twinkleplop_adapter } from './libraries/twinkleplop/adapter.ts';

/** Every adapter, in display order. */
export const ADAPTERS: ReadonlyArray<HighlighterAdapter> = [
	twinkleplop_adapter,
	prism_adapter,
	shiki_js_adapter,
	shiki_wasm_adapter,
	fuz_code_adapter
];
