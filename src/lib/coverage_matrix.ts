/**
 * The coverage matrix: which languages each library claims, with a numbered
 * footnote wherever the support is indirect.
 *
 * @module
 */

import type { BenchResults } from './results_schema.ts';

/** How one library covers one language. */
export type CoverageCell =
	{ kind: 'direct' } | { kind: 'via'; footnote: number } | { kind: 'unsupported' };

/** A coverage matrix: a row of cells by library id for each language, and the footnotes. */
export interface CoverageMatrix {
	rows: Array<{ lang: BenchResults['langs'][number]; cells: Record<string, CoverageCell> }>;
	/** The footnote texts. A cell's `footnote` is an index into them. */
	footnotes: Array<string>;
}

/**
 * Builds the coverage matrix of a results file. Footnotes are numbered in the
 * order the matrix first uses them, reading by row, and a text shared by two
 * libraries is one footnote.
 */
export const to_coverage_matrix = (
	results: Pick<BenchResults, 'meta' | 'langs' | 'coverage'>
): CoverageMatrix => {
	const footnotes: Array<string> = [];
	const rows = results.langs.map((lang) => {
		const cells: Record<string, CoverageCell> = {};
		for (const { id } of results.meta.libraries) {
			const claimed = Object.hasOwn(results.coverage, id) ? results.coverage[id]! : {};
			const entry = Object.hasOwn(claimed, lang.id) ? claimed[lang.id]! : null;
			if (entry === null) {
				cells[id] = { kind: 'unsupported' };
			} else if (entry === true) {
				cells[id] = { kind: 'direct' };
			} else {
				let footnote = footnotes.indexOf(entry.via);
				if (footnote === -1) footnote = footnotes.push(entry.via) - 1;
				cells[id] = { kind: 'via', footnote };
			}
		}
		return { lang, cells };
	});
	return { rows, footnotes };
};
