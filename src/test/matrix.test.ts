import { assert, describe, test } from 'vitest';

import {
	format_matrix_value,
	matrix_row_value,
	matrix_row_baseline,
	matrix_row_entry,
	matrix_row_is_bounded,
	matrix_row_is_complete,
	to_geomean_row,
	to_matrix_ratios,
	to_matrix_row,
	to_value_entry,
	type MatrixEntry,
	type MatrixRow
} from '$lib/matrix.ts';

const LIBRARIES = ['a', 'b', 'c'];

const to_row = (
	entries: Record<string, MatrixEntry | number>,
	direction: MatrixRow['direction'] = 'lower'
): MatrixRow =>
	to_matrix_row({
		key: JSON.stringify(entries),
		label: 'row',
		unit: 'ns',
		direction,
		entries: Object.fromEntries(
			Object.entries(entries).map(([id, entry]) => [
				id,
				typeof entry === 'number' ? to_value_entry(entry) : entry
			])
		)
	});

const UNSUPPORTED: MatrixEntry = { kind: 'unsupported', langs: ['xml'] };
const EXCLUDED: MatrixEntry = { kind: 'excluded', reason: 'produced no tokens' };

describe('matrix_row_entry', () => {
	test('a library with no entry is unmeasured, never a zero', () => {
		assert.deepStrictEqual(matrix_row_entry(to_row({ a: 1 }), 'b'), { kind: 'unmeasured' });
		assert.deepStrictEqual(matrix_row_entry(to_row({ a: 1 }), '__proto__'), { kind: 'unmeasured' });
	});
});

describe('ratios', () => {
	test('are taken against the best in the row, in the row direction', () => {
		assert.deepStrictEqual(to_matrix_ratios(to_row({ a: 100, b: 200, c: 400 }), LIBRARIES, null), {
			a: 1,
			b: 2,
			c: 4
		});
		assert.deepStrictEqual(
			to_matrix_ratios(to_row({ a: 100, b: 200, c: 400 }, 'higher'), LIBRARIES, null),
			{ a: 4, b: 2, c: 1 }
		);
	});

	test('are taken against a reference library, and may be under 1', () => {
		assert.deepStrictEqual(to_matrix_ratios(to_row({ a: 100, b: 200, c: 400 }), LIBRARIES, 'b'), {
			a: 0.5,
			b: 1,
			c: 2
		});
	});

	test('the best is the best of the selected libraries only', () => {
		const row = to_row({ a: 100, b: 200, c: 400 });
		assert.strictEqual(matrix_row_baseline(row, ['b', 'c'], null), 200);
		assert.deepStrictEqual(to_matrix_ratios(row, ['b', 'c'], null), { b: 1, c: 2 });
	});

	test('an unsupported or excluded library has no ratio and is never the best', () => {
		const row = to_row({ a: UNSUPPORTED, b: 200, c: EXCLUDED });
		assert.strictEqual(matrix_row_baseline(row, LIBRARIES, null), 200);
		const wider = to_row({ a: UNSUPPORTED, b: 200, c: 400 });
		assert.deepStrictEqual(to_matrix_ratios(wider, LIBRARIES, null), { b: 1, c: 2 });
	});

	test('a row has no ratios when its reference has no number', () => {
		const row = to_row({ a: EXCLUDED, b: 200, c: 400 });
		assert.strictEqual(matrix_row_baseline(row, LIBRARIES, 'a'), null);
		assert.deepStrictEqual(to_matrix_ratios(row, LIBRARIES, 'a'), {});
	});

	test('a row with one number has nothing to compare', () => {
		assert.deepStrictEqual(
			to_matrix_ratios(to_row({ a: 100, b: UNSUPPORTED }), LIBRARIES, null),
			{}
		);
	});

	test('a number that is not positive leaves the row with no baseline, never the runner-up', () => {
		// skipping the zero would call `b` the best, when `a` may be the smallest in the row
		for (const value of [0, -0.05]) {
			const row = to_row({ a: value, b: 200, c: 400 });
			assert.strictEqual(matrix_row_baseline(row, LIBRARIES, null), null);
			assert.deepStrictEqual(to_matrix_ratios(row, LIBRARIES, null), {});
			assert.deepStrictEqual(to_matrix_ratios(row, LIBRARIES, 'b'), {});
		}
		// a library that isn't selected doesn't take the row's ratios with it
		assert.deepStrictEqual(to_matrix_ratios(to_row({ a: 0, b: 200, c: 400 }), ['b', 'c'], null), {
			b: 1,
			c: 2
		});
	});

	test('without a resolution, a number marked unranked leaves the row with no ratios', () => {
		const row = to_row({ a: to_value_entry(50, { unranked: 'inside the noise' }), b: 200, c: 400 });
		assert.strictEqual(matrix_row_baseline(row, LIBRARIES, null), null);
		assert.deepStrictEqual(to_matrix_ratios(row, LIBRARIES, null), {});
		assert.ok(!matrix_row_is_bounded(row, LIBRARIES, null));
		assert.ok(!matrix_row_is_complete(row, LIBRARIES));
		assert.ok(matrix_row_is_complete(row, ['b', 'c']));
	});

	test('a row that is not compared has no ratios', () => {
		const row = { ...to_row({ a: 100, b: 200, c: 400 }), compared: false };
		assert.strictEqual(matrix_row_baseline(row, LIBRARIES, null), null);
		assert.deepStrictEqual(to_matrix_ratios(row, LIBRARIES, 'a'), {});
	});
});

describe('a row with a resolution', () => {
	const NOISY = to_value_entry(0.5, { unranked: 'inside the noise' });
	const UNDER = to_value_entry(-0.05, { unranked: 'at or under the baseline' });
	const with_resolution = (entries: Record<string, MatrixEntry | number>): MatrixRow => ({
		...to_row(entries),
		resolution: 2
	});

	test('with every number rankable, is compared exactly, as a row without one', () => {
		const row = with_resolution({ a: 4, b: 8, c: 16 });
		assert.deepStrictEqual(to_matrix_ratios(row, LIBRARIES, null), { a: 1, b: 2, c: 4 });
		assert.ok(!matrix_row_is_bounded(row, LIBRARIES, null));
		assert.deepStrictEqual(to_matrix_ratios(row, LIBRARIES, 'b'), { a: 0.5, b: 1, c: 2 });
		assert.ok(!matrix_row_is_bounded(row, LIBRARIES, 'b'));
	});

	test('with a number inside it, the rest are bounds against the resolution, and none is 1.00×', () => {
		for (const small of [NOISY, UNDER, 0]) {
			const row = with_resolution({ a: small, b: 8, c: 16 });
			assert.strictEqual(matrix_row_baseline(row, LIBRARIES, null), 2);
			assert.ok(matrix_row_is_bounded(row, LIBRARIES, null));
			const ratios = to_matrix_ratios(row, LIBRARIES, null);
			assert.deepStrictEqual(ratios, { b: 4, c: 8 });
			assert.notInclude(Object.values(ratios), 1);
			assert.ok(!matrix_row_is_complete(row, LIBRARIES));
		}
	});

	test('a bound is never under 1, even for a number under the resolution that was not marked', () => {
		const row = with_resolution({ a: NOISY, b: 1, c: 16 });
		assert.ok(matrix_row_is_bounded(row, LIBRARIES, null));
		assert.deepStrictEqual(to_matrix_ratios(row, LIBRARIES, null), { c: 8 });
		// against a rankable reference the ratio is exact, and may be under 1
		assert.deepStrictEqual(to_matrix_ratios(row, LIBRARIES, 'c'), { b: 1 / 16, c: 1 });
	});

	test('with every number inside it, has no ratios', () => {
		const row = with_resolution({ a: NOISY, b: UNDER, c: NOISY });
		assert.deepStrictEqual(to_matrix_ratios(row, LIBRARIES, null), {});
	});

	test('a rankable reference gives exact ratios, and the numbers inside the noise none', () => {
		const row = with_resolution({ a: NOISY, b: 8, c: 16 });
		assert.strictEqual(matrix_row_baseline(row, LIBRARIES, 'b'), 8);
		assert.ok(!matrix_row_is_bounded(row, LIBRARIES, 'b'));
		assert.deepStrictEqual(to_matrix_ratios(row, LIBRARIES, 'b'), { b: 1, c: 2 });
	});

	test('a reference inside the noise is no reference: the rest are bounds', () => {
		const row = with_resolution({ a: NOISY, b: 8, c: 16 });
		assert.ok(matrix_row_is_bounded(row, LIBRARIES, 'a'));
		assert.deepStrictEqual(to_matrix_ratios(row, LIBRARIES, 'a'), { b: 4, c: 8 });
	});

	test('a reference with no number in the row leaves no ratios', () => {
		const row = with_resolution({ a: NOISY, b: 8, c: EXCLUDED });
		assert.deepStrictEqual(to_matrix_ratios(row, LIBRARIES, 'c'), {});
		assert.ok(!matrix_row_is_bounded(row, LIBRARIES, 'c'));
	});

	test('deselecting the library inside the noise restores exact ratios', () => {
		const row = with_resolution({ a: NOISY, b: 8, c: 16 });
		assert.deepStrictEqual(to_matrix_ratios(row, ['b', 'c'], null), { b: 1, c: 2 });
		assert.ok(!matrix_row_is_bounded(row, ['b', 'c'], null));
		assert.ok(matrix_row_is_complete(row, ['b', 'c']));
	});

	test('a mean leaves a bounded row out, since a bound can not enter one', () => {
		const rows = [
			with_resolution({ a: 4, b: 8, c: 16 }),
			with_resolution({ a: NOISY, b: 8, c: 16 })
		];
		const mean = to_geomean_row(rows, LIBRARIES, 'mean', 'geomean')!;
		assert.include(mean.note, '1 of 2 rows');
		assert.include(mean.note, 'left out');
		assert.closeTo(matrix_row_value(mean, 'a')!, 4, 1e-9);
		assert.closeTo(matrix_row_value(mean, 'c')!, 16, 1e-9);
	});
});

describe('matrix_row_is_complete', () => {
	test('needs a positive number for every selected library', () => {
		assert.ok(matrix_row_is_complete(to_row({ a: 1, b: 2, c: 3 }), LIBRARIES));
		assert.ok(!matrix_row_is_complete(to_row({ a: 1, b: 2 }), LIBRARIES));
		assert.ok(!matrix_row_is_complete(to_row({ a: 1, b: 2, c: UNSUPPORTED }), LIBRARIES));
		assert.ok(!matrix_row_is_complete(to_row({ a: 1, b: 2, c: EXCLUDED }), LIBRARIES));
		assert.ok(!matrix_row_is_complete(to_row({ a: 1, b: 2, c: 0 }), LIBRARIES));
	});

	test('depends on which libraries are selected', () => {
		assert.ok(matrix_row_is_complete(to_row({ a: 1, b: 2, c: EXCLUDED }), ['a', 'b']));
	});

	test('no selected library is not complete', () => {
		assert.ok(!matrix_row_is_complete(to_row({ a: 1 }), []));
	});
});

describe('to_geomean_row', () => {
	const rows = [
		to_row({ a: 1, b: 10, c: 100 }),
		to_row({ a: 100, b: 10, c: 1 }),
		// `c` skipped the slow one: counting it for `a` and `b` alone would favor `c`
		to_row({ a: 10_000, b: 10_000, c: EXCLUDED })
	];

	test('covers only the rows complete for every selected library, and says how many', () => {
		const row = to_geomean_row(rows, LIBRARIES, 'mean', 'geomean')!;
		assert.strictEqual(row.kind, 'summary');
		assert.strictEqual(row.unit, 'ns');
		assert.strictEqual(row.direction, 'lower');
		for (const id of LIBRARIES) {
			const entry = matrix_row_entry(row, id);
			assert.ok(entry.kind === 'value');
			assert.closeTo(entry.value, 10, 1e-9);
		}
		assert.include(row.note, '2 of 3 rows');
	});

	test('covers more rows when the library that skipped one is deselected', () => {
		const row = to_geomean_row(rows, ['a', 'b'], 'mean', 'geomean')!;
		assert.include(row.note, '3 of 3 rows');
		const entry = matrix_row_entry(row, 'a');
		assert.ok(entry.kind === 'value');
		assert.closeTo(entry.value, 100, 1e-9);
		assert.deepStrictEqual(matrix_row_entry(row, 'c'), { kind: 'unmeasured' });
	});

	test('leaves out a row holding a number that can not be ranked, and says rows are left out', () => {
		const noisy = to_row({ a: to_value_entry(1, { unranked: 'inside the noise' }), b: 10, c: 100 });
		const row = to_geomean_row([rows[0]!, rows[1]!, noisy], LIBRARIES, 'mean', 'geomean')!;
		assert.include(row.note, '2 of 3 rows');
		assert.include(row.note, 'left out');
		const entry = matrix_row_entry(row, 'a');
		assert.ok(entry.kind === 'value');
		assert.closeTo(entry.value, 10, 1e-9);
	});

	test('a mean carries no floor of its own and is compared', () => {
		const row = to_geomean_row(rows, LIBRARIES, 'mean', 'geomean')!;
		assert.strictEqual(row.floor, null);
		assert.ok(row.compared);
	});

	test('with no complete row, says there is no mean, and never that it was not measured', () => {
		const row = to_geomean_row([rows[2]!], LIBRARIES, 'mean', 'geomean')!;
		assert.strictEqual(row.note, 'over 0 of 1 row');
		assert.strictEqual(
			row.empty,
			'no row has a number that can be compared for every library shown'
		);
		assert.deepStrictEqual(row.entries, {});
		// a mean that covers something has entries, and no such message
		assert.strictEqual(to_geomean_row(rows, LIBRARIES, 'mean', 'geomean')!.empty, null);
	});

	test('is null for no rows', () => {
		assert.strictEqual(to_geomean_row([], LIBRARIES, 'mean', 'geomean'), null);
	});
});

describe('format_matrix_value', () => {
	const cases: Array<[value: number, unit: MatrixRow['unit'], expected: string]> = [
		[55.556, 'mb_per_sec', '55.6 MB/s'],
		[5425.347, 'ops_per_sec', '5,425 ops/s'],
		[184_320, 'ns', '184 µs'],
		[2.01, 'ms', '2.01 ms'],
		[12_822, 'bytes', '12.8 kB'],
		[13_403, 'count', '13,403']
	];
	test.each(cases)('%s as %s', (value, unit, expected) => {
		assert.strictEqual(format_matrix_value(value, unit), expected);
	});
});
