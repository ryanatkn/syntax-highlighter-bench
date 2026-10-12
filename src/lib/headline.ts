/**
 * The headline figures of the landing page, each drawn as bars, and the table
 * of what each language costs in a bundle: read from a results file by the same
 * functions the results page uses.
 *
 * @module
 */

import { BENCH_MODES, BENCH_SIZES } from './bench_constants.ts';
import {
	find_core_set,
	find_single_set,
	find_timed_set,
	to_bundle_loaded_entry,
	to_bundle_row,
	to_bundle_size_entry
} from './bundle_matrix.ts';
import { DEFAULT_HEAP_MEASURE, to_heap_floor, to_heap_groups } from './heap_matrix.ts';
import {
	matrix_row_value,
	to_geomean_row,
	to_matrix_row,
	to_value_entry,
	type MatrixGroup,
	type MatrixResults,
	type MatrixRow
} from './matrix.ts';
import { DEFAULT_FORM, DEFAULT_SET, DEFAULT_SOURCE } from './results_filters.ts';
import type { BenchSet } from './results_schema.ts';
import { to_startup_groups } from './startup_matrix.ts';
import { results_have_throughput, to_throughput_summary } from './throughput_matrix.ts';

/** The compression the headline bundle sizes are shown in. */
export const HEADLINE_COMPRESSION = 'gzip';

/**
 * The geometric mean over the languages of what each library holds, the V8
 * heap, its machine code, and the external memory summed, read against the
 * heap check's tolerance as each language's row is.
 */
const to_memory_row = (
	results: MatrixResults,
	langs: ReadonlyArray<string>,
	libraries: ReadonlyArray<string>
): MatrixRow => {
	const total = to_heap_groups(results, { langs, parts: [DEFAULT_HEAP_MEASURE] }).find(
		(group) => group.key === 'heap:total'
	);
	const row = total && to_geomean_row(total.rows, libraries, 'memory', 'everything held');
	if (!row) {
		return to_matrix_row({
			key: 'memory',
			label: 'everything held',
			unit: 'bytes',
			direction: 'lower',
			empty: 'the file holds no retained heap'
		});
	}
	return {
		...row,
		floor: to_heap_floor(
			libraries.map((id) => matrix_row_value(row, id)).filter((value) => value !== null)
		)
	};
};

/** A headline figure drawn as bars, with what its heading says. */
export interface HeadlineChart {
	row: MatrixRow;
	title: string;
	note: string;
	/** Whether each bar shows its number's details beneath it. */
	details: boolean;
}

/**
 * The headline figures, each drawn as bars: geometric-mean throughput over the
 * neutral inputs for each mode, the time to a first highlight from a cold
 * start, the retained memory over the languages, and everything a page loads
 * over the documentation set with what it is made of. Only the throughput rows
 * carry the run's noise floor, which was calibrated on the timed cells. A
 * figure the file holds no number for is left out, so a file with no timed run
 * draws only its deterministic figures.
 */
export const to_headline_charts = (results: MatrixResults): Array<HeadlineChart> => {
	const libraries = results.meta.libraries.map((library) => library.id);
	const langs = results.langs.map((lang) => lang.id);
	const charts: Array<HeadlineChart> = [];

	if (results_have_throughput(results)) {
		const rows = to_throughput_summary(
			results,
			{
				langs,
				sizes: BENCH_SIZES,
				modes: BENCH_MODES,
				sources: [DEFAULT_SOURCE],
				unit: 'mb_per_sec'
			},
			libraries
		).rows;
		for (const mode of BENCH_MODES) {
			const row = rows.find((r) => r.key === `summary:${DEFAULT_SOURCE}:${mode}`);
			if (!row) continue;
			charts.push({
				row,
				title: mode === 'html' ? 'Highlighting to HTML' : 'Tokenizing',
				note: `MB/s over the ${DEFAULT_SOURCE} inputs, geometric mean`,
				details: false
			});
		}
	}

	const first_highlight = to_startup_groups(results, { langs, forms: [DEFAULT_FORM] }, libraries)
		.find((group) => group.key === `${DEFAULT_FORM}:first_highlight`)
		?.rows.find((row) => row.kind === 'summary');
	if (first_highlight) {
		charts.push({
			row: first_highlight,
			title: 'Cold start to a first highlight',
			note: `ms a ${DEFAULT_FORM} library adds to a fresh Node process, geometric mean over the languages`,
			details: false
		});
	}

	charts.push({
		row: to_memory_row(results, langs, libraries),
		title: 'Retained memory',
		note: 'what a library holds after loading one language and highlighting a small snippet once: V8 heap, machine code, and external memory, geometric mean over the languages',
		details: false
	});

	const set = results.sets.find((s) => s.id === DEFAULT_SET) ?? null;
	const set_label = `the ${set?.label ?? DEFAULT_SET} set (${set?.langs.join(', ') ?? ''})`;
	// the set's JS alone is a row of the language table, beside the runtime and the other sets
	charts.push({
		row: to_bundle_row(results, { key: 'loaded', label: 'everything loaded' }, (library) => {
			const entry = to_bundle_loaded_entry(results, library, set, HEADLINE_COMPRESSION);
			if (entry.kind !== 'value') return entry;
			// a stylesheet with two palettes is larger than one with one, so the schemes go beside it
			const { theme_schemes } = results.meta.libraries.find((l) => l.id === library)!;
			return { ...entry, details: [...entry.details, `theme: ${theme_schemes.join(' + ')}`] };
		}),
		title: 'Everything a page loads',
		note: `the JS, wasm binary, and theme stylesheet of ${set_label}, each compressed on its own with ${HEADLINE_COMPRESSION}`,
		details: true
	});

	return charts.filter(
		(chart) => chart.row.empty === null && Object.keys(chart.row.entries).length > 0
	);
};

/**
 * What a page loads for its languages: the runtime, the library with no
 * language, which highlights nothing alone, then bundles of several languages
 * (the default set and every timed language, which every library claims), then
 * each language's whole bundle, runtime included, every one minified and
 * compressed with `HEADLINE_COMPRESSION`. Whole bundles rather than
 * differences, so every number is one a page ships; the results page has what
 * each language adds.
 *
 * @returns the groups, none for a file that measured no bundle
 */
export const to_language_weight_groups = (results: MatrixResults): Array<MatrixGroup> => {
	const core = find_core_set(results.sets);
	if (!core || Object.keys(results.bundle).length === 0) return [];
	const to_row = (
		key: string,
		label: string,
		set: BenchSet | null,
		note: string | null = null
	): MatrixRow =>
		to_bundle_row(results, { key, label, note }, (library) =>
			to_bundle_size_entry(results, library, set, HEADLINE_COMPRESSION)
		);
	const several = [
		results.sets.find((set) => set.id === DEFAULT_SET),
		find_timed_set(results.sets, results.langs)
	].filter((set) => set !== undefined && set !== null);
	const groups: Array<MatrixGroup> = [
		{
			key: 'core',
			label: 'The runtime',
			note: 'the library with no language: it highlights nothing alone, and every bundle below holds it',
			rows: [to_row('core', core.label, core)]
		}
	];
	// the sets lead the languages, as a summary of what follows
	if (several.length > 0) {
		groups.push({
			key: 'sets',
			label: 'Several languages',
			note: 'one bundle of them all, runtime included',
			rows: several.map((set) => to_row(`set:${set.id}`, set.label, set, set.langs.join(', ')))
		});
	}
	groups.push({
		key: 'langs',
		label: 'One language',
		note: 'the whole bundle of a page that highlights only this language, runtime included',
		rows: results.langs.map((lang) =>
			to_row(`lang:${lang.id}`, lang.label, find_single_set(results.sets, lang.id))
		)
	});
	return groups;
};

/** The size of the code block the practical figures are worked out for, in bytes. */
export const PRACTICE_BLOCK_BYTES = 10_000;

/** One frame at 60 frames a second, the budget an editor highlighting as you type works in. */
export const PRACTICE_FRAME_MS = 16;

/** The source a site build might highlight, in bytes. */
export const PRACTICE_BUILD_BYTES = 1_000_000;

/**
 * The HTML throughput worked out for sizes a reader knows: the time to
 * highlight one block, how many blocks fit in one frame, and the time for a
 * build's worth of source. Each is the geometric-mean rate over the neutral
 * inputs applied to that size, so it is an estimate, and it carries the
 * geomean's noise floor, since every ratio in it is the rate's own.
 *
 * @returns the group, or null for a file with no timed throughput
 */
export const to_practice_group = (results: MatrixResults): MatrixGroup | null => {
	if (!results_have_throughput(results)) return null;
	const libraries = results.meta.libraries.map((library) => library.id);
	const html = to_throughput_summary(
		results,
		{
			langs: results.langs.map((lang) => lang.id),
			sizes: BENCH_SIZES,
			modes: ['html'],
			sources: [DEFAULT_SOURCE],
			unit: 'mb_per_sec'
		},
		libraries
	).rows.find((row) => row.key === `summary:${DEFAULT_SOURCE}:html`);
	if (!html || html.empty !== null) return null;
	const floor = results.meta.noise_floor?.geomean ?? null;
	const block = to_matrix_row({
		key: 'practice:block',
		label: `one ${PRACTICE_BLOCK_BYTES / 1000} kB code block`,
		unit: 'ms',
		direction: 'lower',
		floor
	});
	const frame = to_matrix_row({
		key: 'practice:frame',
		label: `${PRACTICE_BLOCK_BYTES / 1000} kB blocks in one ${PRACTICE_FRAME_MS} ms frame`,
		note: 'whole blocks',
		unit: 'count',
		direction: 'higher',
		// rounded down to whole blocks, so it has no ratio of its own: the rows beside it carry the rate's
		compared: false
	});
	const build = to_matrix_row({
		key: 'practice:build',
		label: `${PRACTICE_BUILD_BYTES / 1_000_000} MB of source`,
		note: 'as a site build might highlight',
		unit: 'ms',
		direction: 'lower',
		floor
	});
	for (const id of libraries) {
		const rate = matrix_row_value(html, id);
		if (rate === null || !(rate > 0)) continue;
		// MB/s is 1e6 bytes a second, so a byte takes 1e-3 / rate milliseconds
		const block_ms = (PRACTICE_BLOCK_BYTES / 1e6 / rate) * 1000;
		block.entries[id] = to_value_entry(block_ms);
		frame.entries[id] = to_value_entry(Math.floor(PRACTICE_FRAME_MS / block_ms));
		build.entries[id] = to_value_entry((PRACTICE_BUILD_BYTES / 1e6 / rate) * 1000);
	}
	return {
		key: 'practice',
		label: 'Highlighting to HTML, at the neutral geometric mean',
		note: html.note,
		rows: [block, frame, build]
	};
};
