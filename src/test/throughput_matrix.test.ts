import { assert, describe, test } from 'vitest';

import { SPREAD_DISTURBED_ABOVE } from '$lib/bench_constants.ts';
import { matrix_row_entry, matrix_row_value, to_matrix_ratios } from '$lib/matrix.ts';
import { BenchMode, BenchSize } from '$lib/results_schema.ts';
import {
	results_have_throughput,
	to_throughput_badges,
	to_throughput_groups,
	to_throughput_summary,
	type ThroughputSelection
} from '$lib/throughput_matrix.ts';
import { load_deterministic, load_fixture, to_library_ids } from './site_test_helpers.ts';

/** A number to three decimals, to tell two means apart. */
const r3 = (n: number): number => Math.round(n * 1000) / 1000;

const fixture = load_fixture();
const libraries = to_library_ids(fixture);

const EVERYTHING: ThroughputSelection = {
	langs: fixture.langs.map((lang) => lang.id),
	sizes: BenchSize.options,
	modes: BenchMode.options,
	sources: ['neutral', 'shiki', 'home:fuz_code'],
	unit: 'mb_per_sec'
};

test('results_have_throughput tells a timed file from a deterministic one', () => {
	assert.ok(results_have_throughput(fixture));
	assert.ok(!results_have_throughput(load_deterministic()));
});

describe('to_throughput_groups', () => {
	const groups = to_throughput_groups(fixture, EVERYTHING, libraries);

	test('a row is a cell, with the value in the selected unit', () => {
		const group = groups.find((g) => g.key === 'ts/neutral')!;
		const cell = fixture.cells.find((c) => c.id === 'neutral/ts/checker_excerpt.ts:tokenize')!;
		const row = group.rows.find((r) => r.key === cell.id)!;
		// the whole path, so two inputs with one file name are told apart without hovering
		assert.strictEqual(row.label, cell.file);
		assert.strictEqual(row.direction, 'higher');
		for (const id of libraries) {
			assert.strictEqual(matrix_row_value(row, id), cell.values[id]!.mb_per_sec);
		}
		const by_time = to_throughput_groups(fixture, { ...EVERYTHING, unit: 'ns_per_op' }, libraries)
			.find((g) => g.key === 'ts/neutral')!
			.rows.find((r) => r.key === cell.id)!;
		assert.strictEqual(by_time.direction, 'lower');
		assert.strictEqual(matrix_row_value(by_time, 'prism'), cell.values.prism!.ns_per_op);
	});

	test('a home group says whose home turf it is', () => {
		const group = groups.find((g) => g.key === 'svelte/home:fuz_code')!;
		assert.include(group.label, 'home: fuz_code');
		assert.include(group.note, 'home turf');
		assert.include(group.note, 'fuz_code');
	});

	test('an excluded library shows as excluded with its reason, not as a number', () => {
		const group = groups.find((g) => g.key === 'rust/shiki')!;
		const row = group.rows.find((r) => r.key === 'shiki/rust/rust.sample:tokenize')!;
		assert.deepStrictEqual(matrix_row_entry(row, 'prism'), {
			kind: 'excluded',
			reason: 'produced no tokens'
		});
		assert.strictEqual(matrix_row_entry(row, 'fuz_code').kind, 'value');
	});

	test('a group closes with a geometric mean for each mode, over its complete cells only', () => {
		const group = groups.find((g) => g.key === 'rust/shiki')!;
		const means = group.rows.filter((row) => row.kind === 'summary');
		assert.deepStrictEqual(
			means.map((row) => row.label),
			['geomean · tokenize', 'geomean · html']
		);
		// prism is excluded from the only cell of each mode, so no cell is complete
		for (const row of means) {
			assert.include(row.note, '0 of 1 row');
			assert.ok(row.empty !== null);
			for (const id of libraries) assert.strictEqual(matrix_row_value(row, id), null);
		}
		// without prism the cell is complete, and the mean of one cell is that cell
		const others = libraries.filter((id) => id !== 'prism');
		const without = to_throughput_groups(fixture, EVERYTHING, others).find(
			(g) => g.key === 'rust/shiki'
		)!;
		const mean = without.rows.find((row) => row.label === 'geomean · tokenize')!;
		assert.include(mean.note, '1 of 1 row');
		const cell = fixture.cells.find((c) => c.id === 'shiki/rust/rust.sample:tokenize')!;
		assert.closeTo(matrix_row_value(mean, 'fuz_code')!, cell.values.fuz_code!.mb_per_sec, 1e-9);
		assert.strictEqual(matrix_row_value(mean, 'prism'), null);
	});

	test('a retried value is marked, and its details hold every number it records', () => {
		const cell = fixture.cells.find((c) => c.id === 'neutral/ts/checker_excerpt.ts:tokenize')!;
		const row = groups.find((g) => g.key === 'ts/neutral')!.rows.find((r) => r.key === cell.id)!;
		const retried = matrix_row_entry(row, 'shiki_js');
		assert.ok(retried.kind === 'value');
		assert.deepStrictEqual(
			retried.badges.map((badge) => badge.text),
			['retried']
		);
		const value = cell.values.shiki_js!;
		assert.ok(value.attempts > 1);
		const details = retried.details.join('\n');
		for (const part of [
			'p10–p90',
			`spread ${value.spread.toFixed(2)}`,
			'per batch',
			`${value.attempts} attempts`,
			'peak RSS'
		]) {
			assert.include(details, part);
		}
		const calm = matrix_row_entry(row, 'fuz_code');
		assert.ok(calm.kind === 'value');
		assert.deepStrictEqual(calm.badges, []);
	});

	test('a value still disturbed after its retries carries both marks', () => {
		const disturbed = fixture.cells
			.flatMap((cell) => Object.entries(cell.values).map(([id, value]) => ({ cell, id, value })))
			.filter(({ value }) => value.spread > SPREAD_DISTURBED_ABOVE);
		assert.ok(disturbed.length > 0, 'the fixture has no disturbed value');
		for (const { value } of disturbed) {
			assert.deepStrictEqual(
				to_throughput_badges(value).map((badge) => badge.text),
				value.attempts > 1 ? ['disturbed', 'retried'] : ['disturbed']
			);
		}
	});

	test('the fixture does not put one library first everywhere', () => {
		const best: Set<string> = new Set();
		for (const group of groups) {
			for (const row of group.rows.filter((r) => r.kind === 'cell')) {
				const ratios = to_matrix_ratios(row, libraries, null);
				for (const [id, ratio] of Object.entries(ratios)) if (ratio === 1) best.add(id);
			}
		}
		assert.ok(best.size > 1, `only ${[...best].join()} is ever the best`);
	});

	test('a cell row carries the per-cell noise floor, and a mean the floor of a mean', () => {
		const floor = fixture.meta.noise_floor!;
		for (const group of groups) {
			for (const row of group.rows) {
				assert.strictEqual(row.floor, row.kind === 'summary' ? floor.geomean : floor.per_cell);
			}
		}
		const uncalibrated = { ...fixture, meta: { ...fixture.meta, noise_floor: null } };
		for (const group of to_throughput_groups(uncalibrated, EVERYTHING, libraries)) {
			for (const row of group.rows) assert.strictEqual(row.floor, null);
		}
	});
});

describe('to_throughput_badges', () => {
	const value = fixture.cells[0]!.values.fuz_code!;

	test('marks a spread past the threshold, and not one at it', () => {
		const texts = (spread: number): Array<string> =>
			to_throughput_badges({ ...value, spread }).map((badge) => badge.text);
		assert.deepStrictEqual(texts(SPREAD_DISTURBED_ABOVE), []);
		assert.deepStrictEqual(texts(SPREAD_DISTURBED_ABOVE + 0.01), ['disturbed']);
	});
});

describe('to_throughput_summary', () => {
	test('has one mean for each source and mode, and never pools two sources', () => {
		const summary = to_throughput_summary(fixture, EVERYTHING, libraries);
		assert.deepStrictEqual(
			summary.rows.map((row) => row.label),
			[
				'geomean · neutral · tokenize',
				'geomean · neutral · html',
				'geomean · shiki · tokenize',
				'geomean · shiki · html',
				'geomean · home: fuz_code · tokenize',
				'geomean · home: fuz_code · html'
			]
		);
		for (const row of summary.rows) assert.strictEqual(row.kind, 'summary');
	});

	test('a mean is over the cells of its source and mode across languages', () => {
		const summary = to_throughput_summary(fixture, EVERYTHING, libraries);
		const row = summary.rows.find((r) => r.label === 'geomean · neutral · tokenize')!;
		const cells = fixture.cells.filter((c) => c.source === 'neutral' && c.mode === 'tokenize');
		assert.include(row.note, `${cells.length} of ${cells.length} rows`);
		const expected = Math.exp(
			cells.reduce((sum, c) => sum + Math.log(c.values.prism!.mb_per_sec), 0) / cells.length
		);
		assert.closeTo(matrix_row_value(row, 'prism')!, expected, 1e-9);
		// the cells differ, so the mean is neither their first value nor their arithmetic mean
		const values = cells.map((c) => c.values.prism!.mb_per_sec);
		assert.notStrictEqual(values[0], values[1]);
		assert.notStrictEqual(r3(expected), r3(values[0]!));
		assert.notStrictEqual(r3(expected), r3(values.reduce((a, b) => a + b, 0) / values.length));
	});

	test('is empty for a file with no timed cell in the selection', () => {
		assert.deepStrictEqual(
			to_throughput_summary(fixture, { ...EVERYTHING, sources: [] }, libraries).rows,
			[]
		);
	});
});
