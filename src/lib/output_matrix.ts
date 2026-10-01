/**
 * The token-count and output-size tables: the deterministic numbers each cell
 * of a results file states, as rows. A token count is on an input's `tokenize`
 * cell and its HTML's size on the `html` cell, so one input yields a row for
 * each selected measure.
 *
 * @module
 */

import type { BenchCell } from './results_schema.ts';
import { format_bytes } from './bench_format.ts';
import {
	format_cell_group_label,
	format_source_note,
	group_cells,
	to_excluded_reasons,
	to_missing_cell_entry,
	type CellSelection
} from './cell_groups.ts';
import {
	to_matrix_row,
	to_value_entry,
	type MatrixGroup,
	type MatrixResults,
	type MatrixUnit
} from './matrix.ts';

/** A deterministic number of a cell: its token count, or a size of its HTML. */
export type OutputMeasure = 'tokens' | 'html_bytes' | 'spans';

/** Every output measure, with its label, the mode whose cell states it, and its unit. */
export const OUTPUT_MEASURES: ReadonlyArray<{
	id: OutputMeasure;
	label: string;
	mode: BenchCell['mode'];
	unit: MatrixUnit;
}> = [
	{ id: 'tokens', label: 'tokens', mode: 'tokenize', unit: 'count' },
	{ id: 'html_bytes', label: 'HTML bytes', mode: 'html', unit: 'bytes' },
	{ id: 'spans', label: 'HTML elements', mode: 'html', unit: 'count' }
];

/** Which inputs and which of their numbers the output tables show. */
export interface OutputSelection extends Omit<CellSelection, 'modes'> {
	measures: ReadonlyArray<string>;
}

/** One library's number for a measure in a cell, or null when the cell states none. */
const to_output_value = (
	cell: BenchCell,
	library: string,
	measure: OutputMeasure
): number | null => {
	if (measure === 'tokens')
		return Object.hasOwn(cell.tokens, library) ? cell.tokens[library]! : null;
	return Object.hasOwn(cell.output, library) ? cell.output[library]![measure] : null;
};

/**
 * The selected inputs as groups of one language and one source, with a row for
 * each selected measure of each input. There is no summary row: libraries split
 * the same source differently and wrap their HTML differently, so a smaller
 * count is not a better one.
 */
export const to_output_groups = (
	results: MatrixResults,
	selection: OutputSelection
): Array<MatrixGroup> => {
	const excluded = to_excluded_reasons(results);
	const measures = OUTPUT_MEASURES.filter((measure) => selection.measures.includes(measure.id));
	const modes = [...new Set(measures.map((measure) => measure.mode))];
	return group_cells(results, { ...selection, modes }).map((group) => ({
		key: group.key,
		label: format_cell_group_label(group),
		note: format_source_note(group.source_key),
		rows: group.cells.flatMap((cell) =>
			measures
				.filter((measure) => measure.mode === cell.mode)
				.map((measure) => {
					const row = to_matrix_row({
						key: `${cell.id}:${measure.id}`,
						label: cell.file,
						note: `${cell.size} · ${measure.label} · ${format_bytes(cell.bytes)} of source${cell.synthetic ? ' · synthetic' : ''}`,
						unit: measure.unit,
						direction: 'lower'
					});
					for (const { id } of results.meta.libraries) {
						const value = to_output_value(cell, id, measure.id);
						row.entries[id] =
							value === null
								? to_missing_cell_entry(results, excluded, cell, id)
								: to_value_entry(value);
					}
					return row;
				})
		)
	}));
};
