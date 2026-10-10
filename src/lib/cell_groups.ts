/**
 * Groups the cells of a results file for display: by language, then by where
 * the input came from, then by size and mode. A home input is grouped by the
 * library whose samples it is, never pooled with another library's, so a
 * summary over a group can't hide whose home turf it was measured on.
 *
 * @module
 */

import type { BenchCell, BenchLang, BenchSource } from './results_schema.ts';
import { BENCH_MODES, BENCH_SIZES, BENCH_SOURCES } from './bench_constants.ts';
import { coverage_claims_lang, type MatrixEntry, type MatrixResults } from './matrix.ts';

/**
 * The key of an input's source on the site: the source, with the owner
 * appended for a home input, as `home:<library>`.
 */
export const to_source_key = (input: Pick<BenchCell, 'source' | 'home'>): string =>
	input.home === null ? input.source : `${input.source}:${input.home}`;

/** The source keys of a file's cells, in the order of `BENCH_SOURCES`, then by owner. */
export const to_source_keys = (
	cells: ReadonlyArray<Pick<BenchCell, 'source' | 'home'>>
): Array<string> => {
	const order: ReadonlyArray<string> = BENCH_SOURCES;
	const rank = (key: string): number => order.indexOf(key.split(':')[0]!);
	return [...new Set(cells.map(to_source_key))].sort(
		(a, b) => rank(a) - rank(b) || a.localeCompare(b)
	);
};

/** What each source holds, for the note beside its label. */
const SOURCE_NOTES: Record<BenchSource, string> = {
	neutral: 'real code no measured library authored',
	shiki: "Shiki's own benchmark samples",
	home: 'home turf',
	harness: 'snippets written for this benchmark by its maintainer, who also maintains fuz_code',
	stress:
		'pathological and minified inputs, generated for this benchmark by its maintainer, who also maintains fuz_code, to find worst cases; Shiki is timed with its per-line limit out of reach, so it highlights lines its default would cut off'
};

/** A source key's label: the source, naming the owner of a home input. */
export const format_source_key = (key: string): string => {
	const [source, home] = key.split(':');
	return home === undefined ? source! : `${source}: ${home}`;
};

/** What a source key's inputs are, naming whose samples a home input is. */
export const format_source_note = (key: string): string => {
	const [source, home] = key.split(':');
	const note = SOURCE_NOTES[source as BenchSource];
	return home === undefined ? note : `${note}: ${home}'s own samples`;
};

/** The cells of one language from one source. */
export interface CellGroup {
	key: string;
	lang: BenchLang;
	source_key: string;
	cells: Array<BenchCell>;
}

/** Which cells to show. */
export interface CellSelection {
	langs: ReadonlyArray<string>;
	sizes: ReadonlyArray<string>;
	sources: ReadonlyArray<string>;
	modes: ReadonlyArray<string>;
}

/**
 * The selected cells in groups of one language and one source, in roster and
 * source order. Within a group the cells are ordered by size, then file, then
 * mode.
 */
export const group_cells = (
	results: Pick<MatrixResults, 'langs' | 'cells'>,
	selection: CellSelection
): Array<CellGroup> => {
	const sizes: ReadonlyArray<string> = BENCH_SIZES;
	const modes: ReadonlyArray<string> = BENCH_MODES;
	const selected = results.cells.filter(
		(cell) =>
			selection.langs.includes(cell.lang) &&
			selection.sizes.includes(cell.size) &&
			selection.modes.includes(cell.mode) &&
			selection.sources.includes(to_source_key(cell))
	);
	const groups: Array<CellGroup> = [];
	for (const lang of results.langs) {
		const of_lang = selected.filter((cell) => cell.lang === lang.id);
		for (const source_key of to_source_keys(of_lang)) {
			const cells = of_lang
				.filter((cell) => to_source_key(cell) === source_key)
				.sort(
					(a, b) =>
						sizes.indexOf(a.size) - sizes.indexOf(b.size) ||
						a.file.localeCompare(b.file) ||
						modes.indexOf(a.mode) - modes.indexOf(b.mode)
				);
			groups.push({ key: `${lang.id}/${source_key}`, lang, source_key, cells });
		}
	}
	return groups;
};

/**
 * A cell's row label: its file name. A group holds one source and one
 * language, which is all the rest of the path says, and one directory never
 * holds two files of one name, so the name tells a group's rows apart.
 */
export const to_cell_label = (cell: Pick<BenchCell, 'file'>): string =>
	cell.file.slice(cell.file.lastIndexOf('/') + 1);

/** The label of a cell group: its language and its source. */
export const format_cell_group_label = (group: CellGroup): string =>
	`${group.lang.label} · ${format_source_key(group.source_key)}`;

/** The reason each excluded library has in each cell, by `to_excluded_key`. */
export const to_excluded_reasons = (results: Pick<MatrixResults, 'meta'>): Map<string, string> =>
	new Map(results.meta.excluded.map((e) => [to_excluded_key(e.cell, e.library), e.reason]));

/** The key of one library in one cell. */
export const to_excluded_key = (cell: string, library: string): string =>
	JSON.stringify([cell, library]);

/**
 * Why a library has no number in a cell: excluded with its reason, unsupported
 * when it doesn't claim the cell's language, and otherwise unmeasured.
 */
export const to_missing_cell_entry = (
	results: Pick<MatrixResults, 'coverage'>,
	excluded: ReadonlyMap<string, string>,
	cell: Pick<BenchCell, 'id' | 'lang'>,
	library: string
): MatrixEntry => {
	const reason = excluded.get(to_excluded_key(cell.id, library));
	if (reason !== undefined) return { kind: 'excluded', reason };
	if (!coverage_claims_lang(results.coverage, library, cell.lang)) {
		return { kind: 'unsupported', langs: [cell.lang] };
	}
	return { kind: 'unmeasured' };
};
