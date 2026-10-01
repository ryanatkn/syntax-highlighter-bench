/**
 * The headline figures of the landing page: a few rows for each library, read
 * from a results file by the same functions the results page uses. A timed row
 * of a file that holds no timed number says so, and never shows a number.
 *
 * @module
 */

import { BENCH_MODES, BENCH_SIZES } from './bench_constants.ts';
import {
	to_bundle_beside_group,
	to_bundle_loaded_entry,
	to_bundle_size_entry
} from './bundle_matrix.ts';
import { to_matrix_row, type MatrixGroup, type MatrixResults, type MatrixRow } from './matrix.ts';
import { DEFAULT_FORM, DEFAULT_SET, DEFAULT_SOURCE } from './results_filters.ts';
import { to_startup_groups } from './startup_matrix.ts';
import { results_have_throughput, to_throughput_summary } from './throughput_matrix.ts';

/** What a timed row says when the file holds no timed number. */
export const NO_TIMED_RESULTS = 'no timed results are published yet';

/** The compression the headline bundle sizes are shown in. */
export const HEADLINE_COMPRESSION = 'gzip';

/**
 * The headline rows: geometric-mean throughput over the neutral inputs for each
 * mode, the time to a first highlight from a cold start, and the bundle size
 * over the documentation set: the JavaScript, everything a page loads, and the
 * wasm and the theme stylesheet on their own. Only the throughput rows carry
 * the run's noise floor, which was calibrated on the timed cells.
 */
export const to_headline_groups = (results: MatrixResults): Array<MatrixGroup> => {
	const libraries = results.meta.libraries.map((library) => library.id);
	const langs = results.langs.map((lang) => lang.id);

	const throughput: Array<MatrixRow> = results_have_throughput(results)
		? to_throughput_summary(
				results,
				{
					langs,
					sizes: BENCH_SIZES,
					modes: BENCH_MODES,
					sources: [DEFAULT_SOURCE],
					unit: 'mb_per_sec'
				},
				libraries
			).rows
		: BENCH_MODES.map((mode) =>
				to_matrix_row({
					key: `throughput:${mode}`,
					label: mode,
					unit: 'mb_per_sec',
					direction: 'higher',
					empty: NO_TIMED_RESULTS
				})
			);

	const first_highlight = to_startup_groups(results, { langs, forms: [DEFAULT_FORM] }, libraries)
		.find((group) => group.key === `${DEFAULT_FORM}:first_highlight`)
		?.rows.find((row) => row.kind === 'summary');
	const startup = first_highlight
		? { ...first_highlight, label: 'first highlight' }
		: to_matrix_row({
				key: 'startup:first_highlight',
				label: 'first highlight',
				unit: 'ms',
				direction: 'lower',
				empty: NO_TIMED_RESULTS
			});

	const set = results.sets.find((s) => s.id === DEFAULT_SET) ?? null;
	const bundle = to_matrix_row({
		key: 'bundle',
		label: 'JavaScript',
		note: set ? set.langs.join(', ') : null,
		unit: 'bytes',
		direction: 'lower'
	});
	const loaded = to_matrix_row({
		key: 'loaded',
		label: 'everything loaded',
		note: 'JavaScript + wasm binary + theme stylesheet',
		unit: 'bytes',
		direction: 'lower'
	});
	for (const id of libraries) {
		bundle.entries[id] = to_bundle_size_entry(results, id, set, HEADLINE_COMPRESSION);
		loaded.entries[id] = to_bundle_loaded_entry(results, id, set, HEADLINE_COMPRESSION);
	}

	return [
		{
			key: 'throughput',
			label: 'Throughput',
			note: `megabytes of source per second, over the ${DEFAULT_SOURCE} inputs: higher is better`,
			rows: throughput
		},
		{
			key: 'startup',
			label: 'Cold start',
			note: `what a ${DEFAULT_FORM} library adds to a Node process before its first highlight: lower is better`,
			rows: [startup]
		},
		{
			key: 'bundle',
			label: `Bundle size over the ${set?.label ?? DEFAULT_SET} set`,
			note: `minified and compressed with ${HEADLINE_COMPRESSION}: lower is better`,
			rows: [bundle, loaded]
		},
		to_bundle_beside_group(results, { set: DEFAULT_SET, compression: HEADLINE_COMPRESSION })
	];
};
