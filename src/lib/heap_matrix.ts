/**
 * The retained-heap tables: what each library holds once one language is
 * loaded and highlighted once, as a row for each language. A file states three
 * numbers for each (`BenchHeap`): the V8 heap less machine code, the machine
 * code, where compiled regular expressions live, and the external memory beside
 * it, where a WebAssembly engine keeps its linear memory. Four groups show them:
 * the three summed, which is what a consumer pays and so is ranked first, then
 * each on its own.
 *
 * @module
 */

import { format_bytes } from './bench_format.ts';
import { HEAP_TOLERANCE_KB, HEAP_TOLERANCE_RATIO } from './bench_constants.ts';
import type { BenchHeap } from './results_schema.ts';
import {
	coverage_claims_lang,
	matrix_row_value,
	to_matrix_row,
	to_value_entry,
	type MatrixEntry,
	type MatrixGroup,
	type MatrixResults
} from './matrix.ts';

/** A number of a retained heap, or the three summed. */
export type HeapMeasure = 'total' | 'retained' | 'code' | 'external';

/** Every measure, in display order, with its label and whether its rows are compared. */
export const HEAP_MEASURES: ReadonlyArray<{
	id: HeapMeasure;
	label: string;
	note: string;
	compared: boolean;
}> = [
	{
		id: 'total',
		label: 'Everything held',
		note: 'the V8 heap, its machine code, and the external memory, summed',
		compared: true
	},
	{
		id: 'retained',
		label: 'V8 heap',
		note: 'what V8 lays out, less machine code',
		compared: true
	},
	{
		id: 'code',
		label: 'Machine code',
		note: 'compiled regular expressions and optimized functions, on x64',
		compared: true
	},
	{
		id: 'external',
		label: 'External',
		note: "array buffers and a wasm engine's linear memory, at the size it has grown to; most libraries hold none, so not compared",
		compared: false
	}
];

/** A measure of one entry, in bytes: the file records kibibytes. */
const to_heap_bytes = (entry: BenchHeap, measure: HeapMeasure): number =>
	1024 *
	(measure === 'total'
		? entry.retained_kb + entry.code_kb + entry.external_kb
		: measure === 'retained'
			? entry.retained_kb
			: measure === 'code'
				? entry.code_kb
				: entry.external_kb);

/**
 * The noise floor of a heap row, as a ratio's deviation: the tolerance two
 * readings are compared within, `HEAP_TOLERANCE_KB` or `HEAP_TOLERANCE_RATIO`,
 * whichever is larger, taken against the smallest number in the row.
 *
 * @param values - the row's numbers, in bytes
 * @returns the floor, or null for a row with no positive number
 */
export const to_heap_floor = (values: ReadonlyArray<number>): number | null => {
	const positive = values.filter((value) => value > 0);
	if (positive.length === 0) return null;
	return Math.max((HEAP_TOLERANCE_KB * 1024) / Math.min(...positive), HEAP_TOLERANCE_RATIO);
};

/** Whether a file holds any retained heap. */
export const results_have_heap = (results: Pick<MatrixResults, 'heap'>): boolean =>
	Object.keys(results.heap).length > 0;

/**
 * The selected languages as rows, in the file's order, once for each measure.
 * A library that doesn't claim a language is unsupported there, and one that
 * claims it with no reading, as in a run filtered to other libraries, is
 * unmeasured.
 *
 * @returns the groups, none for a file with no retained heap
 */
export const to_heap_groups = (
	results: MatrixResults,
	selection: { langs: ReadonlyArray<string> }
): Array<MatrixGroup> => {
	if (!results_have_heap(results)) return [];
	const langs = results.langs.filter((lang) => lang.timed && selection.langs.includes(lang.id));
	if (langs.length === 0) return [];
	const to_entry = (library: string, lang: string, measure: HeapMeasure): MatrixEntry => {
		if (!coverage_claims_lang(results.coverage, library, lang)) {
			return { kind: 'unsupported', langs: [lang] };
		}
		const entry = results.heap[library]?.[lang];
		if (entry === undefined) return { kind: 'unmeasured' };
		return to_value_entry(to_heap_bytes(entry, measure), {
			details: [
				`V8 heap ${format_bytes(entry.retained_kb * 1024)}, machine code ${format_bytes(entry.code_kb * 1024)}, external ${format_bytes(entry.external_kb * 1024)}`
			]
		});
	};
	return HEAP_MEASURES.map((measure) => ({
		key: `heap:${measure.id}`,
		label: measure.label,
		note: measure.note,
		rows: langs.map((lang) => {
			const row = to_matrix_row({
				key: `heap:${measure.id}:${lang.id}`,
				label: lang.label,
				unit: 'bytes',
				direction: 'lower',
				compared: measure.compared
			});
			for (const { id } of results.meta.libraries)
				row.entries[id] = to_entry(id, lang.id, measure.id);
			if (measure.compared) {
				row.floor = to_heap_floor(
					results.meta.libraries
						.map(({ id }) => matrix_row_value(row, id))
						.filter((value) => value !== null)
				);
			}
			return row;
		})
	}));
};
