/**
 * The shape every table of the results pages shares: rows of one entry per
 * library, in groups. The modules that read a results file build these, and one
 * component renders them, so throughput, cold start, bundle size, and output
 * size are compared the same way.
 *
 * An entry is a number or the reason there is none, and the reasons stay apart:
 * `unsupported` (the library doesn't claim the language), `excluded` (it claims
 * it and failed the output check), `none` (the library has no such thing, like a
 * wasm binary), and `unmeasured` (the file holds no number here). Only a number
 * ever enters a ratio or a geometric mean.
 *
 * @module
 */

import type { BenchResults } from './results_schema.ts';
import {
	format_bytes,
	format_count,
	format_ms,
	format_ns,
	format_significant
} from './bench_format.ts';
import { to_geomean, to_ratio, type RatioDirection } from './ratio.ts';

/** A results file as the results pages receive it: without the corpus inputs. */
export type MatrixResults = Omit<BenchResults, 'inputs'>;

/** What a row's numbers are, which decides how they print. */
export type MatrixUnit = 'mb_per_sec' | 'ns' | 'ops_per_sec' | 'ms' | 'bytes' | 'count';

/** A short mark on a value that a reader should weigh, with the reason. */
export interface MatrixBadge {
	text: string;
	title: string;
}

/** A number in a row, with what a reader may want to know about it. */
export interface MatrixValue {
	kind: 'value';
	value: number;
	/** Printed in place of the number, when the number itself would mislead. */
	text: string | null;
	details: Array<string>;
	badges: Array<MatrixBadge>;
	/**
	 * Why the number can't be compared with another, or null when it can. Such a
	 * number has no ratio, and its row is left out of a geometric mean.
	 */
	unranked: string | null;
}

/** One library's place in a row: a number, or why there is none. */
export type MatrixEntry =
	| MatrixValue
	| { kind: 'unsupported'; langs: Array<string> }
	| { kind: 'excluded'; reason: string }
	| { kind: 'none'; text: string }
	| { kind: 'unmeasured' };

/** One row of a table: a cell of the benchmark, or a summary over cells. */
export interface MatrixRow {
	key: string;
	kind: 'cell' | 'summary';
	label: string;
	note: string | null;
	unit: MatrixUnit;
	direction: RatioDirection;
	/** Whether the row's numbers are compared: a row that is not has no ratios. */
	compared: boolean;
	/**
	 * The noise floor the row's ratios are read against, as `BenchNoiseFloor`
	 * holds it, or null for a row with none: only a timed throughput row has one.
	 */
	floor: number | null;
	/**
	 * The smallest difference the row can tell apart, in the row's unit, or null
	 * for a row whose numbers are all exact. When a number in the row is below
	 * it, the others are compared with it, as lower bounds. Only a cold-start
	 * row has one.
	 */
	resolution: number | null;
	/** By library id. A library with no entry reads as `unmeasured`. */
	entries: Record<string, MatrixEntry>;
	/** Set in place of entries when the row has nothing to show for any library. */
	empty: string | null;
}

/** Rows under one heading. */
export interface MatrixGroup {
	key: string;
	label: string;
	note: string | null;
	rows: Array<MatrixRow>;
}

/** An entry holding a number. */
export const to_value_entry = (
	value: number,
	options: Partial<Omit<MatrixValue, 'kind' | 'value'>> = {}
): MatrixValue => ({
	kind: 'value',
	value,
	text: null,
	details: [],
	badges: [],
	unranked: null,
	...options
});

/** A row with the defaults filled in. */
export const to_matrix_row = (
	row: Pick<MatrixRow, 'key' | 'label' | 'unit' | 'direction'> & Partial<MatrixRow>
): MatrixRow => ({
	kind: 'cell',
	note: null,
	compared: true,
	floor: null,
	resolution: null,
	entries: {},
	empty: null,
	...row
});

/** A library's entry in a row. */
export const matrix_row_entry = (row: MatrixRow, library: string): MatrixEntry =>
	Object.hasOwn(row.entries, library) ? row.entries[library]! : { kind: 'unmeasured' };

/** A library's number in a row, or null when its entry is anything else. */
export const matrix_row_value = (row: MatrixRow, library: string): number | null => {
	const entry = matrix_row_entry(row, library);
	return entry.kind === 'value' ? entry.value : null;
};

/** Whether a number can enter a ratio: positive, finite, and not marked as unranked. */
const is_ranked = (entry: MatrixEntry): entry is MatrixValue =>
	entry.kind === 'value' &&
	entry.unranked === null &&
	entry.value > 0 &&
	Number.isFinite(entry.value);

/**
 * Whether every one of the libraries has a number in the row that a ratio can
 * be made from. Only such a row enters a geometric mean.
 */
export const matrix_row_is_complete = (row: MatrixRow, libraries: ReadonlyArray<string>): boolean =>
	libraries.length > 0 && libraries.every((library) => is_ranked(matrix_row_entry(row, library)));

/** What a row's ratios are taken against, and whether they are only lower bounds. */
interface MatrixBaseline {
	value: number;
	bound: boolean;
}

/**
 * Decides a row's baseline. With every number rankable it is the reference
 * library's, or the best in the row. When a number can't be ranked, the row
 * never falls back to the best of the rest, which would call a runner-up the
 * best: a row with a `resolution` is compared with that resolution, as lower
 * bounds, unless a rankable reference was chosen, and a row without one has no
 * baseline at all.
 */
const resolve_baseline = (
	row: MatrixRow,
	libraries: ReadonlyArray<string>,
	reference: string | null
): MatrixBaseline | null => {
	if (!row.compared) return null;
	const numbered = libraries
		.map((library) => matrix_row_entry(row, library))
		.filter((entry) => entry.kind === 'value');
	const anchor = reference === null ? null : matrix_row_entry(row, reference);
	// a reference with no number in the row leaves nothing to compare against
	if (anchor !== null && anchor.kind !== 'value') return null;
	if (!numbered.every(is_ranked)) {
		if (row.resolution === null) return null;
		if (anchor !== null && is_ranked(anchor)) return { value: anchor.value, bound: false };
		return { value: row.resolution, bound: true };
	}
	if (anchor !== null) return { value: anchor.value, bound: false };
	let best: number | null = null;
	for (const { value } of numbered) {
		if (best === null || (row.direction === 'lower' ? value < best : value > best)) best = value;
	}
	return best === null ? null : { value: best, bound: false };
};

/**
 * The number a row's ratios are taken against: the reference library's, or the
 * best among the libraries when no reference is chosen.
 *
 * When any of the libraries' numbers can't be ranked (one that isn't positive,
 * or one marked `unranked`), the best of the rest is never used: the number set
 * aside may be the smallest in the row. A row with a `resolution` is then
 * compared with that resolution, and a row without one has no baseline.
 *
 * @param reference - a library id, or null for the best in the row
 * @returns the baseline, or null when the row isn't compared, a number in it
 * can't be ranked and the row has no resolution, the reference has no number,
 * or no library has one
 */
export const matrix_row_baseline = (
	row: MatrixRow,
	libraries: ReadonlyArray<string>,
	reference: string | null
): number | null => resolve_baseline(row, libraries, reference)?.value ?? null;

/**
 * Whether a row's ratios are lower bounds: its baseline is the row's
 * resolution, because the smallest numbers in it are below what can be told
 * apart. The true ratio to the best is at least the one shown.
 */
export const matrix_row_is_bounded = (
	row: MatrixRow,
	libraries: ReadonlyArray<string>,
	reference: string | null
): boolean => resolve_baseline(row, libraries, reference)?.bound ?? false;

/**
 * Each library's ratio against the row's baseline: 1 is the baseline, and more
 * is that many times worse. A number that can't be ranked has no ratio, nor has
 * one under the resolution of a row whose ratios are bounds, and a
 * row where fewer than two of the libraries have a number has none at all:
 * there is nothing to compare.
 *
 * @returns the ratios by library id, for the libraries that have one
 */
export const to_matrix_ratios = (
	row: MatrixRow,
	libraries: ReadonlyArray<string>,
	reference: string | null
): Record<string, number> => {
	const ratios: Record<string, number> = {};
	const baseline = resolve_baseline(row, libraries, reference);
	const numbered = libraries.filter((library) => matrix_row_value(row, library) !== null);
	if (baseline === null || numbered.length < 2) return ratios;
	for (const library of libraries) {
		const entry = matrix_row_entry(row, library);
		const ratio = is_ranked(entry) ? to_ratio(entry.value, baseline.value, row.direction) : null;
		// a number under the resolution is inside the noise whether or not it was marked,
		// so a bound is never under 1
		if (ratio !== null && !(baseline.bound && ratio < 1)) ratios[library] = ratio;
	}
	return ratios;
};

/**
 * A summary row holding each library's geometric mean over the rows that are
 * complete for every one of the libraries. A mean over a different set of rows
 * for each library would favor whichever library skipped the slow ones, so a
 * row missing any selected library is left out for all of them, as is a row
 * holding a number that can't be ranked, whose ratios are at best bounds, and
 * the row's note says how many it covers. With no complete row there is no
 * mean, and the row says so in place of its entries.
 *
 * @param rows - the cell rows to summarize, sharing a unit and a direction
 * @param libraries - the selected library ids
 * @returns the summary row, or null when there are no rows to summarize
 */
export const to_geomean_row = (
	rows: ReadonlyArray<MatrixRow>,
	libraries: ReadonlyArray<string>,
	key: string,
	label: string
): MatrixRow | null => {
	const first = rows[0];
	if (!first) return null;
	const complete = rows.filter((row) => matrix_row_is_complete(row, libraries));
	const entries: Record<string, MatrixEntry> = {};
	for (const library of libraries) {
		const mean = to_geomean(complete.map((row) => matrix_row_value(row, library)!));
		if (mean !== null) entries[library] = to_value_entry(mean);
	}
	const covers = `${complete.length} of ${rows.length} ${rows.length === 1 ? 'row' : 'rows'}`;
	return to_matrix_row({
		key,
		kind: 'summary',
		label,
		note:
			complete.length === rows.length || complete.length === 0
				? `over ${covers}`
				: `over ${covers}: the rest lack a number that can be compared exactly for a selected library, and are left out`,
		unit: first.unit,
		direction: first.direction,
		entries,
		empty:
			complete.length === 0
				? 'no row has a number that can be compared for every library shown'
				: null
	});
};

/** A row's number as text, in the row's unit. */
export const format_matrix_value = (value: number, unit: MatrixUnit): string => {
	switch (unit) {
		case 'mb_per_sec':
			return `${format_significant(value)} MB/s`;
		case 'ops_per_sec':
			return `${format_significant(value)} ops/s`;
		case 'ns':
			return format_ns(value);
		case 'ms':
			return format_ms(value);
		case 'bytes':
			return format_bytes(value);
		case 'count':
			return format_count(value);
	}
};

/** Whether a library's coverage claims a language. */
export const coverage_claims_lang = (
	coverage: BenchResults['coverage'],
	library: string,
	lang: string
): boolean => Object.hasOwn(coverage, library) && Object.hasOwn(coverage[library]!, lang);
