/**
 * How the site names a library's engine kind and output shape, the same in
 * the libraries table and in the results page's filters.
 *
 * @module
 */

import type { BenchLibrary } from './results_schema.ts';

/** The name of each engine kind. */
export const ENGINE_LABELS: Record<BenchLibrary['engine'], string> = {
	scanner: 'single-pass lexers',
	grammar_vm: 'grammar VM',
	regex: 'regex grammars',
	textmate: 'TextMate grammars'
};

/** The name of each output shape. */
export const OUTPUT_LABELS: Record<BenchLibrary['output'], string> = {
	classes: 'classes',
	inline_styles: 'inline styles'
};

/** The name of an engine kind or an output shape, or the id for one it doesn't know. */
export const format_library_tag = (id: string): string =>
	Object.hasOwn(ENGINE_LABELS, id)
		? ENGINE_LABELS[id as BenchLibrary['engine']]
		: Object.hasOwn(OUTPUT_LABELS, id)
			? OUTPUT_LABELS[id as BenchLibrary['output']]
			: id;

/**
 * One color per library, by its place in the roster, so a library's bars are
 * the same color in every chart. The ratio beside a bar carries the verdict,
 * colored by the ratio scale, as tsv's benchmark charts do.
 */
export const LIBRARY_COLORS: ReadonlyArray<string> = [
	'var(--palette_d_40)',
	'var(--palette_g_40)',
	'var(--palette_h_40)',
	'var(--palette_i_40)',
	'var(--palette_a_40)',
	'var(--palette_e_40)',
	'var(--palette_j_40)',
	'var(--palette_f_40)'
];

/** The color of the library at `index` in the roster, cycling past the last. */
export const to_library_color = (index: number): string =>
	LIBRARY_COLORS[index % LIBRARY_COLORS.length]!;
