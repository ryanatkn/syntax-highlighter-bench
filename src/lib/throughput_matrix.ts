/**
 * The throughput tables: the timed cells of a results file as rows, each group
 * closed by a geometric mean for each mode.
 *
 * @module
 */

import type { BenchCell, BenchCellValue } from './results_schema.ts';
import { SPREAD_DISTURBED_ABOVE } from './bench_constants.ts';
import { format_bytes, format_count, format_ns, format_significant } from './bench_format.ts';
import {
	format_cell_group_label,
	format_source_key,
	format_source_note,
	group_cells,
	to_cell_label,
	to_excluded_reasons,
	to_missing_cell_entry,
	to_source_key,
	to_source_keys,
	type CellSelection
} from './cell_groups.ts';
import {
	to_geomean_row,
	to_matrix_row,
	to_value_entry,
	type MatrixBadge,
	type MatrixGroup,
	type MatrixResults,
	type MatrixRow,
	type MatrixUnit
} from './matrix.ts';
import type { RatioDirection } from './ratio.ts';

/**
 * The number a throughput cell is shown as. `mb_per_sec` is the one to compare
 * across inputs of different sizes.
 */
export type ThroughputUnit = 'mb_per_sec' | 'ns_per_op' | 'ops_per_sec';

/** Every throughput unit, with its label, in display order. */
export const THROUGHPUT_UNITS: ReadonlyArray<{ id: ThroughputUnit; label: string }> = [
	{ id: 'mb_per_sec', label: 'MB/s' },
	{ id: 'ns_per_op', label: 'time per call' },
	{ id: 'ops_per_sec', label: 'calls per second' }
];

const UNIT_TO_MATRIX: Record<ThroughputUnit, { unit: MatrixUnit; direction: RatioDirection }> = {
	mb_per_sec: { unit: 'mb_per_sec', direction: 'higher' },
	ns_per_op: { unit: 'ns', direction: 'lower' },
	ops_per_sec: { unit: 'ops_per_sec', direction: 'higher' }
};

/** Which cells the throughput tables show, and in which unit. */
export interface ThroughputSelection extends CellSelection {
	unit: ThroughputUnit;
}

/** Whether a results file holds any timed cell value. */
export const results_have_throughput = (results: Pick<MatrixResults, 'cells'>): boolean =>
	results.cells.some((cell) => Object.keys(cell.values).length > 0);

/** The marks on a value whose rounds disagreed or that was measured again. */
export const to_throughput_badges = (value: BenchCellValue): Array<MatrixBadge> => {
	const badges: Array<MatrixBadge> = [];
	if (value.spread > SPREAD_DISTURBED_ABOVE) {
		badges.push({
			text: 'disturbed',
			title: `its rounds disagreed: a spread of ${value.spread.toFixed(2)} is over ${SPREAD_DISTURBED_ABOVE}`
		});
	}
	if (value.attempts > 1) {
		badges.push({
			text: 'retried',
			title: `measured ${value.attempts} times: the numbers are from the attempt whose rounds agreed best`
		});
	}
	return badges;
};

/** Everything a cell value records, as lines for the detail view. */
export const to_throughput_details = (value: BenchCellValue): Array<string> => [
	`${format_ns(value.ns_per_op)} per call`,
	`${format_significant(value.ops_per_sec)} calls/s`,
	`${format_significant(value.mb_per_sec)} MB/s`,
	`p10–p90 ${format_ns(value.p10_ns)}–${format_ns(value.p90_ns)}`,
	`spread ${value.spread.toFixed(2)}`,
	`${format_count(value.iterations)} ${value.iterations === 1 ? 'call' : 'calls'} per batch`,
	`${value.attempts} ${value.attempts === 1 ? 'attempt' : 'attempts'}`,
	`peak RSS ${format_bytes(value.rss_peak_bytes)}`
];

/** A cell's size, mode, and bytes, as the note beside its file name. */
const to_cell_note = (cell: BenchCell): string =>
	`${cell.size} · ${cell.mode} · ${format_bytes(cell.bytes)}${cell.synthetic ? ' · synthetic' : ''}`;

/** A geometric mean over cell rows, read against the noise floor of a mean. */
const to_throughput_mean = (
	results: MatrixResults,
	rows: ReadonlyArray<MatrixRow>,
	libraries: ReadonlyArray<string>,
	key: string,
	label: string
): MatrixRow | null => {
	const row = to_geomean_row(rows, libraries, key, label);
	return row && { ...row, floor: results.meta.noise_floor?.geomean ?? null };
};

/** A cell as a row, in the selected unit. */
const to_throughput_row = (
	results: MatrixResults,
	excluded: ReadonlyMap<string, string>,
	cell: BenchCell,
	unit: ThroughputUnit
): MatrixRow => {
	const row = to_matrix_row({
		key: cell.id,
		label: to_cell_label(cell),
		note: to_cell_note(cell),
		floor: results.meta.noise_floor?.per_cell ?? null,
		...UNIT_TO_MATRIX[unit]
	});
	for (const { id } of results.meta.libraries) {
		const value = Object.hasOwn(cell.values, id) ? cell.values[id]! : null;
		row.entries[id] = value
			? to_value_entry(value[unit], {
					details: to_throughput_details(value),
					badges: to_throughput_badges(value)
				})
			: to_missing_cell_entry(results, excluded, cell, id);
	}
	return row;
};

/**
 * The selected cells as groups of one language and one source, each closed by
 * a geometric mean for every selected mode.
 *
 * @param libraries - the selected library ids, which decide which cells are
 * complete and so enter a mean
 */
export const to_throughput_groups = (
	results: MatrixResults,
	selection: ThroughputSelection,
	libraries: ReadonlyArray<string>
): Array<MatrixGroup> => {
	const excluded = to_excluded_reasons(results);
	return group_cells(results, selection).map((group) => {
		const rows = group.cells.map((cell) =>
			to_throughput_row(results, excluded, cell, selection.unit)
		);
		const means = selection.modes.flatMap((mode) => {
			const of_mode = rows.filter((_, i) => group.cells[i]!.mode === mode);
			return (
				to_throughput_mean(
					results,
					of_mode,
					libraries,
					`${group.key}:${mode}:geomean`,
					`geomean · ${mode}`
				) ?? []
			);
		});
		return {
			key: group.key,
			label: format_cell_group_label(group),
			note: format_source_note(group.source_key),
			rows: [...rows, ...means]
		};
	});
};

/**
 * The geometric means across every selected language: one row for each source
 * and mode. Sources are never pooled, so a mean over home inputs always names
 * the library whose samples they are.
 */
export const to_throughput_summary = (
	results: MatrixResults,
	selection: ThroughputSelection,
	libraries: ReadonlyArray<string>
): MatrixGroup => {
	const excluded = to_excluded_reasons(results);
	const cells = group_cells(results, selection).flatMap((group) => group.cells);
	const rows: Array<MatrixRow> = [];
	for (const source_key of to_source_keys(cells)) {
		for (const mode of selection.modes) {
			const of_both = cells
				.filter((cell) => to_source_key(cell) === source_key && cell.mode === mode)
				.map((cell) => to_throughput_row(results, excluded, cell, selection.unit));
			const row = to_throughput_mean(
				results,
				of_both,
				libraries,
				`summary:${source_key}:${mode}`,
				`geomean · ${format_source_key(source_key)} · ${mode}`
			);
			if (row) rows.push(row);
		}
	}
	return { key: 'summary', label: 'Every selected language', note: null, rows };
};
