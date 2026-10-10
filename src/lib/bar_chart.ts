/**
 * One row of a results table drawn as bars, a bar per library. The bars
 * repeat the numbers for the eye, and the ratios are the table's own
 * (`to_matrix_ratios`): against the best in the row, or against the library a
 * reader chose, so a chart never compares differently from the table it
 * summarizes.
 *
 * @module
 */

import {
	format_matrix_value,
	matrix_row_entry,
	matrix_row_is_bounded,
	matrix_rows_max,
	to_matrix_ratios,
	type MatrixRow
} from './matrix.ts';
import { ratio_is_within_floor } from './ratio.ts';

/** One library's bar: a number with its length and ratio, or the reason there is none. */
export interface BarChartItem {
	library: string;
	/** The number as text, or the reason there is none. */
	text: string;
	/** Whether the library has a number in the row. */
	has_value: boolean;
	/**
	 * The bar's length, as a fraction of the row's largest number: 0, and no bar,
	 * with no number or one at or under zero.
	 */
	fraction: number;
	/** The ratio against the baseline, when the number has one. */
	ratio: number | undefined;
	/** Whether the ratio is inside the row's noise floor, and so not a difference. */
	within_floor: boolean;
	/** Whether the ratio is a lower bound, as `matrix_row_is_bounded` says. */
	bound: boolean;
	/** Whether this library's number is the one the ratios are taken against. */
	anchor: boolean;
	/** What the number is made of, as the tables show it in a cell's details. */
	details: Array<string>;
}

/** What an entry without a number says on its bar. */
const to_missing_text = (row: MatrixRow, library: string): string => {
	const entry = matrix_row_entry(row, library);
	switch (entry.kind) {
		case 'unsupported':
			return `unsupported: no ${entry.langs.join(', ')}`;
		case 'excluded':
			return 'excluded';
		case 'none':
			return entry.text;
		case 'unmeasured':
			return 'not measured';
		case 'value':
			return entry.text ?? format_matrix_value(entry.value, row.unit);
	}
};

/**
 * The bars of a row, in the order of `libraries`. A bar's length is its number
 * over the largest in the row, whichever direction is better, so a longer bar
 * is always more of the row's unit.
 *
 * @param reference - the library the ratios are taken against, or null for the
 * best in the row
 */
export const to_bar_chart = (
	row: MatrixRow,
	libraries: ReadonlyArray<string>,
	reference: string | null
): Array<BarChartItem> => {
	const ratios = to_matrix_ratios(row, libraries, reference);
	const bound = matrix_row_is_bounded(row, libraries, reference);
	const max = matrix_rows_max([row], libraries);
	return libraries.map((library) => {
		const entry = matrix_row_entry(row, library);
		const ratio = ratios[library];
		if (entry.kind !== 'value') {
			return {
				library,
				text: to_missing_text(row, library),
				has_value: false,
				fraction: 0,
				ratio: undefined,
				within_floor: false,
				bound: false,
				anchor: false,
				details: []
			};
		}
		return {
			library,
			text: entry.text ?? format_matrix_value(entry.value, row.unit),
			has_value: true,
			fraction: max > 0 && entry.value > 0 ? entry.value / max : 0,
			ratio,
			// the baseline itself is exactly 1, and is not a difference to qualify
			within_floor:
				ratio !== undefined &&
				ratio !== 1 &&
				!bound &&
				row.floor !== null &&
				ratio_is_within_floor(ratio, row.floor),
			bound: ratio !== undefined && bound,
			anchor: reference === null ? ratio === 1 && !bound : library === reference,
			details: entry.details
		};
	});
};
