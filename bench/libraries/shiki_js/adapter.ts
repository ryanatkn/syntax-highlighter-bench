/**
 * The adapter for Shiki with its JavaScript regex engine. See `notes.md` beside
 * it for the entry points and why.
 *
 * @module
 */

import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';

import { create_shiki_adapter } from '../shiki.ts';

export const shiki_js_adapter = create_shiki_adapter({
	id: 'shiki_js',
	label: 'Shiki (JS engine)',
	note: 'The JavaScript RegExp engine. The HTML carries inline styles rather than classes.',
	create_engine: () => createJavaScriptRegexEngine(),
	entry: {
		engine_import: `import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';`,
		engine_expression: 'createJavaScriptRegexEngine()',
		sync: true
	}
});
